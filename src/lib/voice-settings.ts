import type { Project, Segment, VoiceSettings } from "./types";

// Shared by server and client.
export const DEFAULT_VOICE: VoiceSettings = {
  mode: "ai",
  voiceId: "XrExE9yKIg1WjnnlVkGX",
  voiceName: "Matilda",
  model: "eleven_flash_v2_5",
};

export const voiceOf = (p: Project): VoiceSettings => ({ ...DEFAULT_VOICE, ...p.voice });

export type ClipStatus = "empty" | "none" | "current" | "outdated";

/** empty = nothing to narrate; none = never generated; outdated = text or voice changed since. */
export function clipStatus(seg: Segment, v: VoiceSettings): ClipStatus {
  if (seg.deleted || !seg.text.trim()) return "empty";
  if (!seg.voice) return "none";
  const same = seg.voice.text === seg.text && seg.voice.voiceId === v.voiceId && seg.voice.model === v.model;
  return same ? "current" : "outdated";
}

/** Rough spoken length before a clip exists (~15 characters per second). */
export const estimateSeconds = (text: string) => text.trim().length / 15;

/** ElevenLabs bills ~1 credit per character; Flash models cost half. */
export const creditCost = (text: string, model: string) =>
  Math.ceil(text.trim().length * (model.includes("flash") ? 0.5 : 1));
