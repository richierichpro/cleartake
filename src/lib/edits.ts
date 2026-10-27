import type { Project, Segment } from "./types";

// Step 9 helpers, shared by the plan, the editor and the server. All times are source time.

export type Range = { start: number; end: number };

/** Every range the user removed: cuts, trimmed start/end, and legacy deleted paragraphs. */
export function removedRanges(project: Project): Range[] {
  const duration = project.video.duration;
  const out: Range[] = (project.cuts ?? []).map((c) => ({ start: c.start, end: c.end }));
  if (project.trim) {
    if (project.trim.start > 0) out.push({ start: 0, end: project.trim.start });
    if (project.trim.end < duration) out.push({ start: project.trim.end, end: duration });
  }
  for (const s of project.segments ?? []) if (s.deleted) out.push({ start: s.start, end: s.end });
  return out.sort((a, b) => a.start - b.start);
}

/** Removes ranges from a list of pieces with exact (not slot-rounded) boundaries. */
export function subtractRanges<T extends Range>(pieces: T[], ranges: Range[]): T[] {
  let out = pieces;
  for (const r of ranges) {
    out = out.flatMap((p) => {
      if (r.end <= p.start || r.start >= p.end) return [p];
      const parts: T[] = [];
      if (r.start > p.start) parts.push({ ...p, end: r.start });
      if (r.end < p.end) parts.push({ ...p, start: r.end });
      return parts;
    });
  }
  return out.filter((p) => p.end - p.start > 0.01);
}

/** A paragraph counts as deleted when the user's cuts cover all of it. */
export function isSegmentRemoved(project: Project, seg: Segment) {
  return subtractRanges([{ start: seg.start, end: seg.end }], removedRanges(project)).length === 0;
}

export const newCutId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
