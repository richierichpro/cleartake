import type { Project, TranscriptWord } from "./types";
import { clipStatus, estimateSeconds, voiceOf } from "./voice-settings";

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

  // Kept stretches of the source after cleanup
  const kept = runsOf(speed)
    .filter((r) => r.value > 0)
    .map((r) => ({ sourceStart: time(r.start), sourceEnd: time(r.end), speed: r.value }));

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
    else if (!aiMode) decision.action = seg.id ? "original voice (no retiming)" : "no transcript";
    else if (seg.isRetake) decision.action = own.length ? "retake: fast-forward (screen changes)" : "retake: cut (screen still)";
    else if (status === "empty") decision.action = "no narration, plays at 1x";
    else {
      const current = status === "current";
      const voiceLen = current ? seg.voice!.duration : estimateSeconds(seg.text);
      decision.voice = voiceLen;
      decision.voiceEstimated = !current;

      if (cleaned > voiceLen + 0.05) {
        const factor = Math.min(cleaned / voiceLen, c.maxSyncSpeed);
        own = own.map((p) => ({ ...p, speed: p.speed * factor }));
        const left = cleaned / factor - voiceLen;
        decision.action =
          left > 0.05
            ? `speed ×${factor.toFixed(2)} (max), then ${left.toFixed(1)}s without narration`
            : `speed ×${factor.toFixed(2)}`;
      } else if (voiceLen > cleaned + 0.05 && own.length) {
        const hold = voiceLen - cleaned;
        // Stillest frame: lowest change both into and out of it.
        let best = -1;
        let bestScore = Infinity;
        for (const p of own) {
          for (let i = Math.ceil(p.sourceStart * fps); i / fps < p.sourceEnd; i++) {
            const score = Math.max(motion.scores[i] ?? 0, motion.scores[i + 1] ?? 0);
            if (score <= bestScore) {
              bestScore = score;
              best = i;
            }
          }
        }
        const lastEnd = own[own.length - 1].sourceEnd;
        const at = best < 0 ? lastEnd : Math.min(best / fps + 0.5 / fps, lastEnd);
        own = own.flatMap((p) =>
          at > p.sourceStart && at <= p.sourceEnd
            ? [
                { ...p, sourceEnd: at, freezeAfter: hold },
                ...(at < p.sourceEnd ? [{ ...p, sourceStart: at }] : []),
              ]
            : [p],
        );
        decision.action = `freeze ${hold.toFixed(1)}s at ${at.toFixed(1)}s`;
      } else decision.action = "fits";

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
