import type { Segment, TranscriptWord } from "./types";

// All segmentation thresholds in one place (seconds).
export const SEGMENT_CONFIG = {
  minDuration: 10, // never end a paragraph before this much speech
  softMax: 20, // past this, end at the next sentence end
  maxDuration: 30, // don't add a sentence that would push past this
  pauseBreak: 1.0, // a silence this long after a sentence is a natural break
  leadIn: 0.3, // a paragraph's video starts this long before its first word
};

export type SegmentConfig = typeof SEGMENT_CONFIG;

const endsSentence = (w: TranscriptWord) => /[.?!]["')\]]?$/.test(w.text);

/** Splits words into sentences: [startIndex, endIndex) pairs. */
function sentences(words: TranscriptWord[]) {
  const out: [number, number][] = [];
  let from = 0;
  words.forEach((w, i) => {
    if (endsSentence(w) || i === words.length - 1) {
      out.push([from, i + 1]);
      from = i + 1;
    }
  });
  return out;
}

/**
 * Groups transcript words into paragraph-sized segments.
 * Paragraphs break only at sentence ends: on a pause ≥ pauseBreak once they're
 * minDuration long, after softMax, or when the next sentence would pass maxDuration.
 * Segments tile the whole video: the silence after a paragraph belongs to it.
 */
export function buildSegments(
  words: TranscriptWord[],
  videoDuration: number,
  config: SegmentConfig = SEGMENT_CONFIG,
): Segment[] {
  const groups: { from: number; to: number; reason: Segment["breakReason"] }[] = [];
  const sents = sentences(words);
  let from = 0;

  sents.forEach(([, to], i) => {
    const next = sents[i + 1];
    if (!next) return groups.push({ from, to, reason: "end" });

    const dur = words[to - 1].end - words[from].start;
    const pause = words[next[0]].start - words[to - 1].end;
    const withNext = words[next[1] - 1].end - words[from].start;

    let reason: Segment["breakReason"] | null = null;
    if (dur >= config.minDuration && pause >= config.pauseBreak) reason = "pause";
    else if (dur >= config.softMax) reason = "length";
    else if (dur >= config.minDuration && withNext > config.maxDuration) reason = "length";

    // Don't strand a short last paragraph if it fits into this one.
    const last = words[words.length - 1].end;
    if (reason === "length" && last - words[next[0]].start < config.minDuration && last - words[from].start <= config.maxDuration) {
      reason = null;
    }

    if (reason) {
      groups.push({ from, to, reason });
      from = to;
    }
  });

  return groups.map((g, i) => {
    const speechStart = words[g.from].start;
    const speechEnd = words[g.to - 1].end;
    const nextStart = groups[i + 1] ? words[groups[i + 1].from].start : null;
    const prevEnd = i > 0 ? words[groups[i - 1].to - 1].end : 0;
    const text = words
      .slice(g.from, g.to)
      .map((w) => w.text)
      .join(" ");
    return {
      id: `s${i + 1}`,
      start: i === 0 ? 0 : Math.max(prevEnd, speechStart - config.leadIn),
      end: nextStart === null ? Math.max(videoDuration, speechEnd) : Math.max(speechEnd, nextStart - config.leadIn),
      speechStart,
      speechEnd,
      wordStart: g.from,
      wordEnd: g.to,
      originalText: text,
      text,
      breakReason: g.reason,
      pauseAfter: nextStart === null ? 0 : nextStart - speechEnd,
    };
  });
}
