import { placeDirector, type Placement } from "./director";
import type { SyncPlan } from "./sync";
import type { Project, TranscriptWord } from "./types";
import { outputZooms, ZOOM_LIMITS } from "./zooms";

// Step 15b: turns the reviewed director plan into what the composition draws, in output seconds.
// Pure and shared by the editor and the export. Keeps effects restrained: nothing animates in or out
// while another animation (a zoom easing, a crossfade, another badge) is running.

export const OVERLAY_CONFIG = {
  intro: 2, // seconds, before the video
  flyIn: 1.3, // seconds added to the intro: the video's first frame flies in tilted, with echoes
  outro: 2, // after it
  step: 3, // how long a step badge stays at least, automatically (shorter when the next one is queued behind it)
  stepMinRead: 2, // a step badge stays at least this long before the next one replaces it
  stepMaxLag: 2.5, // a queued badge may show at most this long after its phrase; later than that it's hidden
  callout: 3.5, // at least, automatically
  readingRate: 2.5, // words per second: longer texts stay longer automatically
  notice: 1.5, // seconds to notice something appeared, before reading it
  autoMax: 6,
  animIn: 0.4,
  animOut: 0.3,
  crossfade: 0.2, // at cuts
  maxDelay: 1.5, // how far an item may move to avoid another animation
};

export interface StepOverlay {
  id: string;
  start: number;
  end: number;
  label: string;
  index: number; // 1-based
}
export interface CalloutOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface Overlays {
  intro: { title: string; subtitle: string; flyIn: boolean } | null;
  outro: { line: string; title: string } | null;
  steps: StepOverlay[];
  callouts: CalloutOverlay[];
  crossfades: number[]; // indexes of plan pieces that fade in over the previous one
  placed: Record<string, Placement>; // final time + why it moved (shown in the Finalize panel)
}

/** How long a badge or callout stays: the user's duration, or enough time to read its text. */
export function itemDuration(kind: "step" | "callout", text: string, duration?: number) {
  if (duration) return duration;
  const c = OVERLAY_CONFIG;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const read = Math.round((c.notice + words / c.readingRate) * 2) / 2; // to 0.5s
  return Math.min(c.autoMax, Math.max(kind === "step" ? c.step : c.callout, read));
}

export const scenesOf = (p: Project) => ({
  intro: p.scenes?.intro ?? true,
  outro: p.scenes?.outro ?? true,
  flyIn: p.scenes?.flyIn ?? true,
});

type Window = [number, number];
const overlaps = (busy: Window[], [a, b]: Window) => busy.some(([s, e]) => a < e && s < b);

export function buildOverlays(project: Project, plan: SyncPlan, words: TranscriptWord[]): Overlays {
  const c = OVERLAY_CONFIG;
  const d = project.director;
  const scenes = scenesOf(project);

  // Animations already on the timeline: zooms easing in and out.
  const busy: Window[] = outputZooms(project, plan).flatMap((z): Window[] => [
    [z.start, z.start + ZOOM_LIMITS.ease],
    [z.end, z.end + ZOOM_LIMITS.ease],
  ]);

  // Crossfades where the video jumps (a cut), unless a zoom is easing right then.
  const crossfades: number[] = [];
  plan.pieces.forEach((p, i) => {
    const prev = plan.pieces[i - 1];
    if (!prev || Math.abs(p.sourceStart - prev.sourceEnd) < 0.05) return;
    const w: Window = [p.outputStart, p.outputStart + c.crossfade];
    if (overlaps(busy, w)) return;
    crossfades.push(i);
    busy.push(w);
  });

  const empty = { steps: [], callouts: [], placed: {} };
  if (!d) return { intro: null, outro: null, crossfades, ...empty };

  const places = placeDirector(project, plan, words, d);
  const placed: Record<string, Placement> = {};

  // Earliest start ≥ t whose in and out animations don't overlap another one.
  function schedule(id: string, t: number, length: number) {
    const end = Math.min(plan.outputDuration, t + length);
    for (let delay = 0; delay <= c.maxDelay + 1e-6; delay += 0.1) {
      const s = t + delay;
      const e = Math.min(plan.outputDuration, s + length);
      if (e - s < c.animIn + c.animOut + 0.5) break;
      if (!overlaps(busy, [s, s + c.animIn]) && !overlaps(busy, [e - c.animOut, e])) {
        busy.push([s, s + c.animIn], [e - c.animOut, e]);
        placed[id] = { time: s, ...(delay > 0.05 && { note: `moved +${delay.toFixed(1)}s so it doesn't animate during another effect` }) };
        return { start: s, end: e };
      }
    }
    busy.push([t, t + c.animIn], [end - c.animOut, end]);
    placed[id] = { time: t, note: "animates at the same time as another effect" };
    return { start: t, end };
  }

  // Steps first (they matter most), then callouts, each in time order.
  const visible = <T extends { id: string }>(items: T[]) =>
    items
      .filter((x) => places[x.id]?.time != null && !places[x.id].hidden)
      .sort((a, b) => places[a.id].time! - places[b.id].time!);

  // Step badges share a spot, so close ones queue: each stays ≥ stepMinRead, the next slides in as it leaves.
  // One that would show more than stepMaxLag after its phrase is hidden instead.
  const steps: StepOverlay[] = [];
  for (const s of visible(d.steps)) {
    const spoken = places[s.id].time!;
    const prev = steps[steps.length - 1];
    const want = prev ? Math.max(spoken, prev.start + c.stepMinRead) : spoken;
    let start = want;
    while (overlaps(busy, [start, start + c.animIn]) && start - want < c.maxDelay) start += 0.1;
    if (start - spoken > c.stepMaxLag + 1e-6) {
      placed[s.id] = { time: spoken, hidden: true, hiddenBy: prev.id, note: `too close to “${prev.label}” to show both` };
      continue;
    }
    if (prev && start < prev.end) {
      prev.end = start;
      const p = placed[prev.id];
      placed[prev.id] = { ...p, note: [p.note, `ends after ${(start - prev.start).toFixed(1)}s when “${s.label}” replaces it`].filter(Boolean).join(" · ") };
    }
    const length = itemDuration("step", s.label, s.duration);
    steps.push({ id: s.id, label: s.label, index: steps.length + 1, start, end: Math.min(plan.outputDuration, start + length) });
    busy.push([start, start + c.animIn]);
    const notes = [
      prev && want > spoken + 0.05 && `queued +${(want - spoken).toFixed(1)}s after “${prev.label}”`,
      start > want + 0.05 && `moved +${(start - want).toFixed(1)}s so it doesn't animate during another effect`,
    ].filter(Boolean);
    placed[s.id] = { time: start, ...(notes.length && { note: notes.join(" · ") }) };
  }
  // A short empty moment between two badges looks like a blink: keep the first until the next replaces it.
  steps.forEach((st, i) => {
    const next = steps[i + 1];
    const setByHand = d.steps.find((x) => x.id === st.id)?.duration;
    if (next && !setByHand && next.start - st.end > 0.05 && next.start - st.end < 1.5) {
      st.end = next.start;
      const p = placed[st.id];
      placed[st.id] = { ...p, note: [p.note, `stays ${(st.end - st.start).toFixed(1)}s, until “${next.label}” replaces it`].filter(Boolean).join(" · ") };
    }
    busy.push([st.end - c.animOut, st.end]);
  });
  const callouts = visible(d.callouts).map((x) => ({
    id: x.id,
    text: x.text,
    ...schedule(x.id, places[x.id].time!, itemDuration("callout", x.text, x.duration)),
  }));
  for (const [id, p] of Object.entries(places)) if (!placed[id]) placed[id] = p;
  // A note from placing the phrase (e.g. "phrase not heard") stays visible.
  for (const [id, p] of Object.entries(places)) if (p.note && placed[id] !== p) placed[id] = { ...placed[id], note: [p.note, placed[id].note].filter(Boolean).join(" · ") };

  return {
    intro: scenes.intro && d.title ? { title: d.title, subtitle: d.subtitle, flyIn: scenes.flyIn } : null,
    outro: scenes.outro && d.outro ? { line: d.outro, title: d.title } : null,
    steps,
    callouts,
    crossfades,
    placed,
  };
}

/** Seconds of intro before output time 0 and of outro after the video. */
export const sceneLengths = (o: Pick<Overlays, "intro" | "outro">) => ({
  lead: o.intro ? OVERLAY_CONFIG.intro + (o.intro.flyIn ? OVERLAY_CONFIG.flyIn : 0) : 0,
  tail: o.outro ? OVERLAY_CONFIG.outro : 0,
});

/** What the composition draws (without the editor-only `placed` notes). */
export const drawnOverlays = (o: Overlays): Omit<Overlays, "placed"> => ({
  intro: o.intro,
  outro: o.outro,
  steps: o.steps,
  callouts: o.callouts,
  crossfades: o.crossfades,
});
