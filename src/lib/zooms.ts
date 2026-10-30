import { outputToSource, sourceToOutput, type SyncPlan } from "./sync";
import type { Project, Zoom } from "./types";
import type { ZoomCandidate } from "./zoom-detect";

// Step 13: zoom data helpers, shared by the editor, the composition and the export.

export const ZOOM_LIMITS = {
  minScale: 1.2,
  maxScale: 2.5,
  defaultScale: 1.6,
  minGap: 3, // spec: no zooms closer than this (output seconds)
  defaultLength: 3, // a zoom added by hand
  minLength: 1,
  ease: 0.7, // seconds to spring in, and to spring out
  // Subtle zooms on clicks (a part of the screen changed): a little closer, briefly.
  subtleScale: 1.3,
  subtleLength: 2, // seconds of the edited video
  subtleLead: 0.4, // start this long before the change, so the zoom arrives with the click
};

export const zoomsOf = (p: Project) => ({ enabled: p.zooms?.enabled ?? true, items: p.zooms?.items ?? [] });

export const newZoomId = () => `zm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A zoom as the composition plays it: output seconds. */
export type OutputZoom = { id: string; start: number; end: number; x: number; y: number; scale: number };

/** Enabled zooms mapped to the edited video. `exclude` leaves one out (while you aim it). */
export function outputZooms(project: Project, plan: SyncPlan, exclude?: string | null): OutputZoom[] {
  const { enabled, items } = zoomsOf(project);
  if (!enabled) return [];
  return items
    .filter((z) => z.enabled && z.id !== exclude)
    .map((z) => ({ ...z, start: sourceToOutput(plan, z.start), end: sourceToOutput(plan, z.end) }))
    .filter((z) => z.end - z.start > 0.2); // cut away entirely
}

/** The part of the recording visible at this scale and focus, 0–1, kept inside the frame. */
export function zoomWindow(x: number, y: number, scale: number) {
  const size = 1 / scale;
  const clamp = (c: number) => Math.max(0, Math.min(1 - size, c - size / 2));
  return { left: clamp(x), top: clamp(y), width: size, height: size };
}

/** Turns a Step 12 suggestion into a zoom: centred on the box, scaled so the box plus context fills the view. */
export function zoomFromSuggestion(c: ZoomCandidate): Zoom {
  const view = Math.max(c.w * 2.5, c.h * 2.5, 1 / ZOOM_LIMITS.maxScale);
  const scale = Math.min(ZOOM_LIMITS.maxScale, Math.max(ZOOM_LIMITS.minScale, 1 / view));
  return {
    id: newZoomId(),
    start: c.start,
    end: Math.max(c.end, c.start + ZOOM_LIMITS.minLength),
    x: c.x + c.w / 2,
    y: c.y + c.h / 2,
    scale: Math.round(scale * 10) / 10,
    enabled: true,
  };
}

/** True if a zoom over [start, end) (output seconds) keeps the minimum gap to every other zoom. */
export function fitsBetween(zooms: { id: string; start: number; end: number }[], start: number, end: number, ignore?: string) {
  return zooms.every((z) => z.id === ignore || end + ZOOM_LIMITS.minGap <= z.start || start >= z.end + ZOOM_LIMITS.minGap);
}


/**
 * Zooms from the Step 12 suggestions, keeping the gap rule against `taken` (output seconds).
 * Sped-up paragraphs compress source time, so each zoom keeps at least defaultLength of the edited video.
 */
export function zoomsFromSuggestions(
  candidates: (ZoomCandidate & { reason?: string })[],
  plan: SyncPlan,
  taken: { id: string; start: number; end: number }[] = [],
) {
  const used = [...taken];
  const added: Zoom[] = [];
  for (const c of candidates) {
    const subtle = c.reason === "click";
    const z = subtle
      ? { ...zoomFromSuggestion(c), start: Math.max(0, c.start - ZOOM_LIMITS.subtleLead), scale: ZOOM_LIMITS.subtleScale }
      : zoomFromSuggestion(c);
    const length = subtle ? ZOOM_LIMITS.subtleLength : ZOOM_LIMITS.defaultLength;
    const out = { id: z.id, start: sourceToOutput(plan, z.start), end: sourceToOutput(plan, z.end) };
    if (out.end - out.start < length) {
      out.end = Math.min(plan.outputDuration, out.start + length);
      z.end = outputToSource(plan, out.end);
    }
    if (out.end - out.start < 0.5 || !fitsBetween(used, out.start, out.end)) continue;
    used.push(out);
    added.push(z);
  }
  return added;
}
