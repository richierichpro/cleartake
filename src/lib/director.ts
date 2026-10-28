import { isSegmentRemoved } from "./edits";
import { segmentRanges, sourceToOutput, type SyncPlan } from "./sync";
import { findPhraseTime } from "./text-match";
import { voiceOf } from "./voice-settings";
import type { DirectorPlan, Project, Segment, TranscriptWord } from "./types";

// Step 15: the AI director's edit plan. Pure helpers shared by the server (validation) and the editor (review).

export const DIRECTOR_CONFIG = {
  calloutEvery: 20, // spec: at most one callout per 20s of video
  stepGap: 4, // step labels closer than this to the previous one are hidden (each needs time to be read)
  maxEmphasisPerParagraph: 2,
  max: { title: 60, subtitle: 90, outro: 70, label: 32, callout: 40, word: 30 }, // characters
};

export type DirectorContent = Pick<DirectorPlan, "title" | "subtitle" | "outro" | "steps" | "callouts" | "emphasis">;

/** What's narrated for a paragraph: the AI script in AI voice mode, otherwise what was said. */
export const narratedText = (project: Project, seg: Segment) =>
  voiceOf(project).mode === "ai" ? seg.text : seg.originalText;

/** Paragraphs that are in the edited video, with their output range and narrated text. */
export function activeParagraphs(project: Project, plan: SyncPlan) {
  const ranges = segmentRanges(plan);
  return (project.segments ?? [])
    .filter((s) => !s.deleted && !isSegmentRemoved(project, s) && narratedText(project, s).trim() && ranges.has(s.id))
    .map((s) => ({ seg: s, ...ranges.get(s.id)!, text: narratedText(project, s).trim() }));
}

/** Fingerprint of the narrated script, so the panel can say "the script changed since this plan". */
export function scriptKey(project: Project) {
  const src = (project.segments ?? [])
    .filter((s) => !s.deleted)
    .map((s) => `${s.id}:${narratedText(project, s).trim()}`)
    .join("|");
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const newItemId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Type-checks and trims a plan (AI reply or the user's edits). Items without text are removed. */
export function cleanPlan(raw: unknown): DirectorContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const m = DIRECTOR_CONFIG.max;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const id = (v: unknown, prefix: string) => (typeof v === "string" && v ? v : newItemId(prefix));
  return {
    title: str(r.title, m.title),
    subtitle: str(r.subtitle, m.subtitle),
    outro: str(r.outro, m.outro),
    steps: list(r.steps)
      .map((s) => ({ id: id(s.id, "s"), segmentId: str(s.segmentId, 40), phrase: str(s.phrase, 120), label: str(s.label, m.label) }))
      .filter((s) => s.segmentId && s.label),
    callouts: list(r.callouts)
      .map((c) => ({ id: id(c.id, "c"), segmentId: str(c.segmentId, 40), phrase: str(c.phrase, 120), text: str(c.text, m.callout) }))
      .filter((c) => c.segmentId && c.text),
    emphasis: list(r.emphasis)
      .map((e) => ({ id: id(e.id, "e"), segmentId: str(e.segmentId, 40), word: str(e.word, m.word) }))
      .filter((e) => e.segmentId && e.word),
  };
}

export interface Placement {
  time: number | null; // output seconds; null = not in the video
  note?: string; // why it moved or won't show
  hidden?: boolean; // kept in the plan but not shown (e.g. a callout too close to another)
}

/**
 * When each plan item happens in the edited video (derived, never stored):
 * steps, callouts and emphasis when their phrase is spoken (the paragraph start if it isn't heard).
 */
export function placeDirector(project: Project, plan: SyncPlan, transcript: TranscriptWord[], d: DirectorContent) {
  const paragraphs = new Map(activeParagraphs(project, plan).map((p) => [p.seg.id, p]));
  const ai = voiceOf(project).mode === "ai";
  const out: Record<string, Placement> = {};

  // When a phrase is spoken in a paragraph: the AI voice's word timings, or the transcript in original mode.
  function spokenAt(segmentId: string, phrase: string) {
    const p = paragraphs.get(segmentId);
    if (!p) return null;
    if (ai) {
      const v = plan.voice.find((x) => x.segmentId === segmentId);
      const t = v && p.seg.voice?.words ? findPhraseTime(p.seg.voice.words, phrase) : null;
      return t === null || !v ? null : v.outputStart + t;
    }
    const t = findPhraseTime(transcript, phrase, p.seg.wordStart, p.seg.wordEnd);
    return t === null ? null : sourceToOutput(plan, t);
  }

  const steps = d.steps.map((s) => {
    const p = paragraphs.get(s.segmentId);
    const t = p && s.phrase ? spokenAt(s.segmentId, s.phrase) : null;
    const place: Placement = !p
      ? { time: null, note: "paragraph cut" }
      : t !== null
        ? { time: t }
        : { time: p.start, ...(s.phrase && { note: "phrase not heard, shown at the paragraph start" }) };
    return { id: s.id, place };
  });
  spaceOut(steps, DIRECTOR_CONFIG.stepGap, "step label");
  for (const e of d.emphasis) {
    const p = paragraphs.get(e.segmentId);
    if (!p) out[e.id] = { time: null, note: "paragraph cut" };
    else out[e.id] = { time: spokenAt(e.segmentId, e.word) ?? p.start, ...(ai && !p.seg.voice?.words && { note: "no voice yet" }) };
  }

  // Callouts: when the phrase is spoken (paragraph start if not heard), then at most one per 20s.
  const callouts = d.callouts.map((c) => {
    const p = paragraphs.get(c.segmentId);
    const t = p ? spokenAt(c.segmentId, c.phrase) : null;
    const place: Placement = !p
      ? { time: null, note: "paragraph cut" }
      : t === null
        ? { time: p.start, note: "phrase not heard, shown at the paragraph start" }
        : { time: t };
    return { id: c.id, place };
  });
  spaceOut(callouts, DIRECTOR_CONFIG.calloutEvery, "callout");

  for (const x of [...steps, ...callouts]) out[x.id] = x.place;
  return out;
}

/** In time order, hides items closer than `gap` seconds to the previous shown one. */
function spaceOut(items: { place: Placement }[], gap: number, what: string) {
  let last = -Infinity;
  for (const { place } of [...items].sort((a, b) => (a.place.time ?? Infinity) - (b.place.time ?? Infinity))) {
    if (place.time === null) continue;
    if (place.time - last < gap) {
      place.hidden = true;
      place.note = [place.note, `within ${gap}s of another ${what}`].filter(Boolean).join(" · ");
    } else last = place.time;
  }
}
