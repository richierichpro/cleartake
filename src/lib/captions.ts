import type { Alignment } from "./elevenlabs";
import type { SyncPlan } from "./sync";
import type { Project, VoiceWord } from "./types";

// Step 14: captions from the AI voice's word timings (ElevenLabs character timestamps).
// Pure: the editor and the export build the same lines from the project + sync plan.

export const CAPTION_CONFIG = {
  maxChars: 36, // per caption, so it stays on one line at 1080p
  maxWords: 7,
  pauseBreak: 0.4, // a gap this long in the voice starts a new caption
  linger: 0.4, // keep a caption up this long after its last word (unless the next one starts)
};

export type CaptionBreak = "sentence" | "pause" | "length" | "paragraph";

export interface CaptionLine {
  start: number; // output seconds
  end: number;
  words: VoiceWord[]; // output seconds
  reason: CaptionBreak; // why the caption ended here (debug)
}

export const captionsOn = (project: Project) => project.captions?.enabled ?? false;

/** Words from character timings: characters between spaces, start of the first to end of the last. */
export function alignmentToWords(a: Alignment): VoiceWord[] {
  const words: VoiceWord[] = [];
  let cur: VoiceWord | null = null;
  for (let i = 0; i < a.characters.length; i++) {
    if (/\s/.test(a.characters[i])) {
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { text: "", start: a.character_start_times_seconds[i], end: 0 };
      words.push(cur);
    }
    cur.text += a.characters[i];
    cur.end = a.character_end_times_seconds[i];
  }
  return words;
}

/** Caption lines for every voice clip the plan plays. */
export function buildCaptions(project: Project, plan: SyncPlan): CaptionLine[] {
  const c = CAPTION_CONFIG;
  const lines: CaptionLine[] = [];
  for (const v of plan.voice) {
    const words = (project.segments?.find((s) => s.id === v.segmentId)?.voice?.words ?? [])
      .map((w) => ({ text: w.text, start: v.outputStart + w.start, end: v.outputStart + w.end }))
      .filter((w) => w.start < plan.outputDuration);

    // 1. Phrases: end at a sentence or a pause in the voice.
    const phrases: { words: VoiceWord[]; reason: CaptionBreak }[] = [];
    let cur: VoiceWord[] = [];
    words.forEach((w, i) => {
      cur.push(w);
      const next = words[i + 1];
      const reason: CaptionBreak | null = !next
        ? "paragraph"
        : /[.!?…]["')\]]*$/.test(w.text)
          ? "sentence"
          : next.start - w.end >= c.pauseBreak
            ? "pause"
            : null;
      if (reason) {
        phrases.push({ words: cur, reason });
        cur = [];
      }
    });

    // 2. Long phrases: split into evenly sized captions (no one-word leftovers).
    for (const ph of phrases) {
      const chars = ph.words.map((w) => w.text).join(" ").length;
      const parts = Math.max(Math.ceil(chars / c.maxChars), Math.ceil(ph.words.length / c.maxWords));
      const per = Math.ceil(ph.words.length / parts);
      for (let k = 0; k < ph.words.length; k += per) {
        const chunk = ph.words.slice(k, k + per);
        const last = k + per >= ph.words.length;
        lines.push({ start: chunk[0].start, end: chunk[chunk.length - 1].end, words: chunk, reason: last ? ph.reason : "length" });
      }
    }
  }

  // 3. Each caption stays a moment after its last word, but never overlaps the next one.
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    l.end = Math.min(l.end + c.linger, next ? next.start : Infinity, plan.outputDuration);
  });
  return lines.filter((l) => l.end > l.start);
}
