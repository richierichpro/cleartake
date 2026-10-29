import type { Project, TranscriptWord, VoiceWord } from "./types";
import { norm } from "./text-match";
import { clipStatus, estimateSeconds, voiceOf } from "./voice-settings";
import { removedRanges, subtractRanges } from "./edits";

// Pure functions: activity map → cleanup → per-paragraph sync → timeline pieces.
// Shared by the editor (debug view, Step 7 preview) and the server (Step 8 export).

// All thresholds in one place. Times in seconds, motion in % of pixels changed.
export const SYNC_CONFIG = {
  fps: 5, // frame sampling rate; one slot = 1/fps = 0.2s
  frameWidth: 160, // sampled frame width (grayscale)
  pixelThreshold: 12, // a pixel "changed" if its gray value moved more than this (0–255); ignores compression noise
  movingThreshold: 0.5, // a slot is "moving" above this % of changed pixels
  speechPad: 0.3, // a slot within this of a spoken word counts as speaking
  minGap: 0.4, // still gaps shorter than this between moving slots count as moving (scrolling flickers)
  stillCutAfter: 1.5, // silent + still longer than this gets cut…
  stillKeep: 0.4, // …keeping this much (half at each edge)
  movingFastAfter: 2, // silent + moving longer than this gets fast-forwarded…
  fastSpeed: 4, // …at this speed
  edgeKeep: 0.5, // trim before the first / after the last activity, keeping this much
  retakeMovingShare: 0.2, // a retake with less than this share of moving slots is cut, otherwise fast-forwarded
  maxSyncSpeed: 2, // never speed a paragraph up more than this to fit its voice
  // Sync anchors: words the AI script kept from what was said line the video up inside a paragraph.
  anchorRun: 2, // only words in a run of at least this many matching words in a row (no lone "the")
  minAnchorGap: 1.2, // seconds of voice between anchors
};
export type SyncConfig = typeof SYNC_CONFIG;

export interface Motion {
  fps: number;
  width: number;
  height: number;
  frames: number;
  scores: number[]; // scores[i] = % pixels changed between frame i-1 and i
}

export type SlotState = "speaking" | "moving" | "still";

export interface CleanupAction {
  kind: "cut" | "fast";
  start: number; // source time
  end: number;
  reason: "still" | "moving" | "lead" | "tail" | "retake" | "deleted";
}

// One piece of the output timeline, in order. Output length = (sourceEnd - sourceStart) / speed + freezeAfter.
export interface TimelinePiece {
  sourceStart: number;
  sourceEnd: number;
  speed: number;
  freezeAfter: number; // hold the piece's last frame this long
  outputStart: number;
  segmentId: string | null;
}

export interface VoicePlacement {
  segmentId: string;
  file: string;
  outputStart: number;
  duration: number;
}

export interface SegmentDecision {
  segmentId: string;
  index: number;
  original: number; // video length before cleanup
  cleaned: number; // after cleanup
  voice: number | null; // voice length (null = no narration)
  voiceEstimated: boolean; // no current clip yet, length is an estimate
  output: number; // final length in the edited video
  action: string;
  anchors?: SyncAnchor[]; // where the voice was lined up with what was said (debug)
}

export interface SyncAnchor {
  phrase: string; // the AI voice's words at the anchor
  source: number; // when you said it (recording seconds)
  voice: number; // when the AI voice says it (seconds into the clip)
}

export interface SyncPlan {
  states: SlotState[];
  actions: CleanupAction[];
  pieces: TimelinePiece[];
  voice: VoicePlacement[];
  decisions: SegmentDecision[];
  sourceDuration: number;
  outputDuration: number;
}

const runsOf = <T>(arr: T[]) => {
  const out: { value: T; start: number; end: number }[] = [];
  arr.forEach((v, i) => {
    const last = out[out.length - 1];
    if (last && last.value === v) last.end = i + 1;
    else out.push({ value: v, start: i, end: i + 1 });
  });
  return out;
};

/** 1. Activity map: label every slot speaking / moving / still. */
export function labelSlots(motion: Motion, words: TranscriptWord[], duration: number, c: SyncConfig = SYNC_CONFIG) {
  const fps = motion.fps;
  const n = Math.max(0, Math.ceil(duration * fps - 1e-6));
  const speaking = new Array<boolean>(n).fill(false);
  for (const w of words) {
    const a = Math.max(0, Math.floor((w.start - c.speechPad) * fps));
    const b = Math.min(n, Math.ceil((w.end + c.speechPad) * fps));
    for (let i = a; i < b; i++) speaking[i] = true;
  }
  const states: SlotState[] = speaking.map((s, i) =>
    s ? "speaking" : (motion.scores[i] ?? 0) > c.movingThreshold ? "moving" : "still",
  );
  // Scrolling/typing flickers between changed and unchanged frames: fill short still gaps inside motion.
  const minGap = Math.round(c.minGap * fps);
  for (const r of runsOf(states)) {
    if (r.value === "still" && r.end - r.start <= minGap && states[r.start - 1] === "moving" && states[r.end] === "moving") {
      for (let i = r.start; i < r.end; i++) states[i] = "moving";
    }
  }
  return states;
}

/** 2. Cleanup: per-slot speed (1 = keep, fastSpeed = fast-forward, 0 = cut). */
function cleanup(states: SlotState[], project: Project, fps: number, c: SyncConfig) {
  const n = states.length;
  const speed = new Array<number>(n).fill(1);
  const reason = new Array<CleanupAction["reason"] | null>(n).fill(null);
  const set = (a: number, b: number, s: number, r: CleanupAction["reason"]) => {
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) {
      speed[i] = s;
      reason[i] = r;
    }
  };
  const aiMode = voiceOf(project).mode === "ai";

  // Silent stretches
  for (const r of runsOf(states)) {
    const len = (r.end - r.start) / fps;
    if (r.value === "still" && len > c.stillCutAfter) {
      const keep = Math.round(c.stillKeep * fps);
      set(r.start + Math.floor(keep / 2), r.end - Math.ceil(keep / 2), 0, "still");
    } else if (r.value === "moving" && len > c.movingFastAfter) {
      set(r.start, r.end, c.fastSpeed, "moving");
    }
  }

  // Trim before the first and after the last activity
  const first = states.findIndex((s) => s !== "still");
  const last = n - 1 - [...states].reverse().findIndex((s) => s !== "still");
  const edge = Math.round(c.edgeKeep * fps);
  if (first > 0) set(0, first - edge, 0, "lead");
  if (first >= 0 && last < n - 1) set(last + 1 + edge, n, 0, "tail");

  for (const seg of project.segments ?? []) {
    const a = Math.floor(seg.start * fps);
    const b = Math.ceil(seg.end * fps);
    if (seg.deleted) set(a, b, 0, "deleted");
    else if (seg.isRetake && aiMode) {
      // Original voice mode only cleans silent parts, so retakes stay.
      const moving = states.slice(a, b).filter((s) => s === "moving").length / Math.max(1, b - a);
      if (moving < c.retakeMovingShare) set(a, b, 0, "retake");
      else set(a, b, c.fastSpeed, "retake");
    }
  }

  const actions: CleanupAction[] = [];
  const keyed = speed.map((s, i) => `${s}|${reason[i]}`);
  for (const r of runsOf(keyed)) {
    if (speed[r.start] === 1) continue;
    actions.push({ kind: speed[r.start] === 0 ? "cut" : "fast", start: r.start / fps, end: r.end / fps, reason: reason[r.start]! });
  }
  return { speed, actions };
}

/** 3 + 4. Sync each paragraph to its voice and lay out the output timeline. */
export function buildSyncPlan(
  project: Project,
  words: TranscriptWord[],
  motion: Motion,
  c: SyncConfig = SYNC_CONFIG,
): SyncPlan {
  const duration = project.video.duration;
  const fps = motion.fps;
  const time = (i: number) => Math.min(duration, i / fps);
  const states = labelSlots(motion, words, duration, c);
  const { speed, actions } = cleanup(states, project, fps, c);
  const v = voiceOf(project);
  const aiMode = v.mode === "ai";

  // Kept stretches of the source after cleanup, minus the user's cuts and trim (exact times).
  const kept = subtractRanges(
    runsOf(speed)
      .filter((r) => r.value > 0)
      .map((r) => ({ start: time(r.start), end: time(r.end), speed: r.value })),
    removedRanges(project),
  ).map((p) => ({ sourceStart: p.start, sourceEnd: p.end, speed: p.speed }));

  const segments = project.segments?.length
    ? project.segments
    : [{ id: "", start: 0, end: duration } as NonNullable<Project["segments"]>[number]];

  const pieces: TimelinePiece[] = [];
  const voice: VoicePlacement[] = [];
  const decisions: SegmentDecision[] = [];
  let cursor = 0;
  const lengthOf = (ps: { sourceStart: number; sourceEnd: number; speed: number; freezeAfter?: number }[]) =>
    ps.reduce((t, p) => t + (p.sourceEnd - p.sourceStart) / p.speed + (p.freezeAfter ?? 0), 0);

  segments.forEach((seg, index) => {
    // Kept pieces inside this paragraph's video range
    let own = kept
      .map((p) => ({ ...p, sourceStart: Math.max(p.sourceStart, seg.start), sourceEnd: Math.min(p.sourceEnd, seg.end), freezeAfter: 0 }))
      .filter((p) => p.sourceEnd - p.sourceStart > 0.01); // drop float slivers at paragraph boundaries
    const cleaned = lengthOf(own);
    const decision: SegmentDecision = {
      segmentId: seg.id,
      index,
      original: seg.end - seg.start,
      cleaned,
      voice: null,
      voiceEstimated: false,
      output: cleaned,
      action: "",
    };

    const status = seg.id ? clipStatus(seg, v) : "empty";
    if (seg.deleted) decision.action = "deleted";
    else if (!own.length && seg.id) decision.action = "cut by you (voice removed)";
    else if (!aiMode) decision.action = seg.id ? "original voice (no retiming)" : "no transcript";
    else if (seg.isRetake) decision.action = own.length ? "retake: fast-forward (screen changes)" : "retake: cut (screen still)";
    else if (status === "empty") decision.action = "no narration, plays at 1x";
    else {
      const current = status === "current";
      const voiceLen = current ? seg.voice!.duration : estimateSeconds(seg.text);
      decision.voice = voiceLen;
      decision.voiceEstimated = !current;

      // Line the video up with the voice at the anchors (or only at the paragraph start), then fit each
      // stretch between anchors to the voice: speed up, or hold the stillest frame. A stretch that can't
      // catch up hands the difference to the next one.
      const anchors =
        current && seg.voice?.words && own.length
          ? syncAnchors(words.slice(seg.wordStart, seg.wordEnd), seg.voice.words, c).filter(
              (a) => own.some((p) => a.source > p.sourceStart && a.source < p.sourceEnd) && a.voice < voiceLen,
            )
          : [];
      const fitted: typeof own = [];
      const notes: string[] = [];
      let out = 0;
      anchors.forEach((a, k) => {
        if (k && a.source <= anchors[k - 1].source) a.source = -1; // keep them in order
      });
      const used = anchors.filter((a) => a.source >= 0);
      const cuts = [-Infinity, ...used.map((a) => a.source), Infinity];
      for (let k = 0; k < cuts.length - 1; k++) {
        const chunk = own
          .map((p) => ({ ...p, sourceStart: Math.max(p.sourceStart, cuts[k]), sourceEnd: Math.min(p.sourceEnd, cuts[k + 1]) }))
          .filter((p) => p.sourceEnd - p.sourceStart > 0.01);
        const target = (k < used.length ? used[k].voice : voiceLen) - out;
        const r = fitToVoice(chunk, target, motion, fps, c);
        fitted.push(...r.pieces);
        out += lengthOf(r.pieces);
        if (r.note) notes.push(r.note);
      }
      own = fitted;
      const left = out - voiceLen;
      decision.action =
        (used.length ? `synced at ${used.length} phrase${used.length > 1 ? "s" : ""}: ` : "") +
        (notes.length ? notes.join(", ") : "fits") +
        (left > 0.05 ? `, then ${left.toFixed(1)}s without narration` : "");
      if (used.length) decision.anchors = used;

      if (current && own.length) voice.push({ segmentId: seg.id, file: seg.voice!.file, outputStart: cursor, duration: voiceLen });
    }

    for (const p of own) {
      pieces.push({ ...p, outputStart: cursor, segmentId: seg.id || null });
      cursor += (p.sourceEnd - p.sourceStart) / p.speed + p.freezeAfter;
    }
    decision.output = lengthOf(own);
    decisions.push(decision);
  });

  return { states, actions, pieces, voice, decisions, sourceDuration: duration, outputDuration: cursor };
}

type FitPiece = { sourceStart: number; sourceEnd: number; speed: number; freezeAfter: number };

/** Fits pieces to `target` seconds: speed up (≤ maxSyncSpeed) or hold the stillest frame. */
function fitToVoice(ps: FitPiece[], target: number, motion: Motion, fps: number, c: SyncConfig) {
  const len = ps.reduce((t, p) => t + (p.sourceEnd - p.sourceStart) / p.speed + p.freezeAfter, 0);
  if (!ps.length) return { pieces: ps, note: "" };
  if (len > target + 0.05) {
    const factor = target > 0.05 ? Math.min(len / target, c.maxSyncSpeed) : c.maxSyncSpeed;
    return { pieces: ps.map((p) => ({ ...p, speed: p.speed * factor })), note: `×${factor.toFixed(2)}${factor >= c.maxSyncSpeed ? " (max)" : ""}` };
  }
  if (target > len + 0.05) {
    const hold = target - len;
    // Stillest frame: lowest change both into and out of it.
    let best = -1;
    let bestScore = Infinity;
    for (const p of ps) {
      for (let i = Math.ceil(p.sourceStart * fps); i / fps < p.sourceEnd; i++) {
        const score = Math.max(motion.scores[i] ?? 0, motion.scores[i + 1] ?? 0);
        if (score <= bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    const lastEnd = ps[ps.length - 1].sourceEnd;
    const at = best < 0 ? lastEnd : Math.min(best / fps + 0.5 / fps, lastEnd);
    const pieces = ps.flatMap((p) =>
      at > p.sourceStart && at <= p.sourceEnd
        ? [{ ...p, sourceEnd: at, freezeAfter: p.freezeAfter + hold }, ...(at < p.sourceEnd ? [{ ...p, sourceStart: at, freezeAfter: 0 }] : [])]
        : [p],
    );
    return { pieces, note: `freeze ${hold.toFixed(1)}s at ${at.toFixed(1)}s` };
  }
  return { pieces: ps, note: "" };
}

/**
 * Sync anchors: words the AI script kept from what was said, as (when you said it, when the voice says it).
 * Longest common subsequence of the two word lists; only words in a run of ≥ anchorRun matches count,
 * spaced ≥ minAnchorGap apart in the voice.
 */
export function syncAnchors(said: TranscriptWord[], voiced: VoiceWord[], c: SyncConfig = SYNC_CONFIG): SyncAnchor[] {
  const a = said.map((w) => norm(w.text));
  const b = voiced.map((w) => norm(w.text));
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] && a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] && a[i] === b[j]) pairs.push([i++, j++]);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  // Length of the run of consecutive matches each pair belongs to.
  const run = new Array<number>(pairs.length).fill(1);
  for (let k = 0; k < pairs.length; ) {
    let e = k + 1;
    while (e < pairs.length && pairs[e][0] === pairs[e - 1][0] + 1 && pairs[e][1] === pairs[e - 1][1] + 1) e++;
    for (let q = k; q < e; q++) run[q] = e - k;
    k = e;
  }
  const anchors: SyncAnchor[] = [];
  let last = 0; // the paragraph start is already lined up
  pairs.forEach(([i, j], k) => {
    if (run[k] < c.anchorRun || voiced[j].start - last < c.minAnchorGap) return;
    anchors.push({ phrase: voiced.slice(j, j + 3).map((w) => w.text).join(" "), source: said[i].start, voice: voiced[j].start });
    last = voiced[j].start;
  });
  return anchors;
}

// ---- Output ↔ source time ------------------------------------------------------
// The editor's timeline, player and paragraph timestamps use output (edited video) time;
// segments, transcript and cuts are stored in source (recording) time.

export const pieceLength = (p: TimelinePiece) => (p.sourceEnd - p.sourceStart) / p.speed + p.freezeAfter;

/** Until motion is analyzed: the recording as-is, split at paragraph boundaries, no voice. */
export function identityPlan(project: Project): SyncPlan {
  const duration = project.video.duration;
  const segs = project.segments?.length ? project.segments : [{ id: "", start: 0, end: duration }];
  const kept = subtractRanges(
    segs.map((s) => ({ start: s.start, end: s.end, segmentId: s.id || null })),
    removedRanges(project),
  );
  let cursor = 0;
  const pieces = kept.map((k) => {
    const piece = { sourceStart: k.start, sourceEnd: k.end, speed: 1, freezeAfter: 0, outputStart: cursor, segmentId: k.segmentId };
    cursor += k.end - k.start;
    return piece;
  });
  return { states: [], actions: [], pieces, voice: [], decisions: [], sourceDuration: duration, outputDuration: cursor };
}

/** Source time → output time. A time inside a cut maps to where the video resumes. */
export function sourceToOutput(plan: SyncPlan, t: number) {
  for (const p of plan.pieces) {
    if (t < p.sourceStart) return p.outputStart;
    if (t < p.sourceEnd) return p.outputStart + (t - p.sourceStart) / p.speed;
  }
  return plan.outputDuration;
}

/** Output time → source time. During a freeze, the frozen frame's time. */
export function outputToSource(plan: SyncPlan, t: number) {
  for (const p of plan.pieces) {
    const moving = (p.sourceEnd - p.sourceStart) / p.speed;
    if (t < p.outputStart + moving) return p.sourceStart + Math.max(0, t - p.outputStart) * p.speed;
    if (t < p.outputStart + moving + p.freezeAfter) return p.sourceEnd;
  }
  return plan.pieces[plan.pieces.length - 1]?.sourceEnd ?? 0;
}

/** Where each paragraph sits in the output. Paragraphs that were cut entirely are missing. */
export function segmentRanges(plan: SyncPlan) {
  const ranges = new Map<string, { start: number; end: number }>();
  for (const p of plan.pieces) {
    if (!p.segmentId) continue;
    const r = ranges.get(p.segmentId);
    const end = p.outputStart + pieceLength(p);
    if (r) r.end = end;
    else ranges.set(p.segmentId, { start: p.outputStart, end });
  }
  return ranges;
}
