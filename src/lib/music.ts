import type { Project } from "./types";

// Background music for product demos (ElevenLabs Music, instrumental). A short list of moods that suit
// demos, not a general music generator. Shared by the Music tab, the composition and the export.

export const MUSIC_PRESETS = [
  { id: "upbeat-tech", name: "Upbeat tech", hint: "Energetic and modern, for launches", prompt: "Upbeat modern tech product launch background music, bright synths, light drums, positive and energetic, steady tempo, no vocals" },
  { id: "calm-focus", name: "Calm and focused", hint: "Soft and steady, for tutorials", prompt: "Calm focused background music for a software tutorial, soft piano and gentle pads, warm, unobtrusive, no vocals" },
  { id: "corporate", name: "Corporate inspiring", hint: "Polished and optimistic", prompt: "Inspiring corporate background music, polished acoustic guitar and soft strings, optimistic and confident, light percussion, no vocals" },
  { id: "lofi", name: "Lo-fi chill", hint: "Relaxed, for casual demos", prompt: "Lo-fi chill hip hop background beat, mellow keys, soft vinyl texture, relaxed groove, no vocals" },
  { id: "minimal", name: "Minimal electronic", hint: "Clean and subtle, for SaaS walkthroughs", prompt: "Minimal clean electronic background music for a SaaS product walkthrough, subtle plucks, soft pulse, spacious, no vocals" },
] as const;
export type MusicPresetId = (typeof MUSIC_PRESETS)[number]["id"];

export const MUSIC_CONFIG = {
  volume: 0.3, // default level (0–1) when nobody is talking
  duck: 0.35, // share of that level kept while the voice speaks
  duckRamp: 0.4, // seconds to dip / come back around the voice
  fadeIn: 1, // seconds at the start
  fadeOut: 2, // seconds at the end
};

/** Music volume at a frame: fades in and out, and dips while the voice speaks (frames, whole video). */
export function musicVolume(frame: number, fps: number, base: number, voice: { start: number; end: number }[], total: number) {
  const c = MUSIC_CONFIG;
  const fadeIn = Math.min(1, frame / (c.fadeIn * fps));
  const fadeOut = Math.min(1, Math.max(0, (total - frame) / (c.fadeOut * fps)));
  const ramp = c.duckRamp * fps;
  let duck = 0;
  for (const v of voice) {
    const away = frame < v.start ? v.start - frame : frame > v.end ? frame - v.end : 0;
    duck = Math.max(duck, 1 - away / ramp);
  }
  return Math.max(0, base * fadeIn * fadeOut * (1 - Math.max(0, duck) * (1 - c.duck)));
}

/** What the composition plays, or null when there's no music or it's off. */
export const musicOf = (p: Project, url: (file: string) => string) =>
  p.music?.enabled && p.music.file ? { src: url(p.music.file), volume: p.music.volume } : null;
