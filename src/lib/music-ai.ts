import fs from "node:fs/promises";
import { MUSIC_CONFIG, MUSIC_PRESETS } from "./music";
import { buildOverlays, sceneLengths } from "./overlays";
import { mutateProject, projectFile, readProject } from "./projects";
import { loadSyncPlan } from "./sync-server";

// Composes the background track with ElevenLabs Music (POST /v1/music), exactly as long as the video
// (intro + video + outro), instrumental. Cached per mood and length.
// Docs: https://elevenlabs.io/docs/api-reference/music/compose

export async function composeMusic(projectId: string, presetId: string) {
  const preset = MUSIC_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error("Unknown music style");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is missing from .env.local");
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");

  const { plan, words } = await loadSyncPlan(project);
  const { lead, tail } = sceneLengths(buildOverlays(project, plan, words));
  const seconds = Math.min(600, Math.max(10, Math.ceil(lead + plan.outputDuration + tail + 1)));
  const file = `music-${preset.id}-${seconds}s.mp3`;

  const cached = await fs.stat(projectFile(projectId, file)).catch(() => null);
  if (!cached) {
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: preset.prompt, music_length_ms: seconds * 1000, model_id: "music_v1", force_instrumental: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const d = body.detail;
      const reason = typeof d === "string" ? d : (d?.message ?? (Array.isArray(d) ? d[0]?.msg : null) ?? `HTTP ${res.status}`);
      throw new Error(`ElevenLabs Music: ${reason}`);
    }
    await fs.writeFile(projectFile(projectId, file), Buffer.from(await res.arrayBuffer()));
  }

  return mutateProject(projectId, (p) => {
    p.music = { enabled: true, preset: preset.id, file, volume: p.music?.volume ?? MUSIC_CONFIG.volume };
  });
}
