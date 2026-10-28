import crypto from "node:crypto";
import fs from "node:fs/promises";
import { alignmentToWords } from "./captions";
import { synthesize, type Alignment } from "./elevenlabs";
import { mutateProject, projectFile, readJson, readProject, writeJson } from "./projects";
import { clipStatus, voiceOf } from "./voice-settings";

/**
 * Generates (or reuses from cache) the AI voice clip for one segment.
 * Clips are cached by hash(model + voice + text), so text that was voiced before,
 * e.g. after Revert, costs nothing.
 */
export async function generateSegmentVoice(projectId: string, segmentId: string) {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");
  const segments = project.segments ?? [];
  const index = segments.findIndex((s) => s.id === segmentId);
  const seg = segments[index];
  if (!seg) throw new Error("Paragraph not found");

  const v = voiceOf(project);
  if (clipStatus(seg, v) === "empty") throw new Error("This paragraph has no text to narrate");

  const text = seg.text.trim();
  const hash = crypto.createHash("sha1").update(`${v.model}|${v.voiceId}|${text}`).digest("hex").slice(0, 16);
  const file = `voice-${hash}.mp3`;

  let alignment = await readJson<Alignment>(projectId, `voice-${hash}.json`);
  const cached = alignment && (await fs.stat(projectFile(projectId, file)).catch(() => null));
  if (!cached) {
    const neighbour = (i: number) => (segments[i] && !segments[i].deleted ? segments[i].text : undefined);
    const out = await synthesize({
      text,
      voiceId: v.voiceId,
      model: v.model,
      previousText: neighbour(index - 1),
      nextText: neighbour(index + 1),
    });
    await fs.writeFile(projectFile(projectId, file), out.audio);
    alignment = out.alignment ?? { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
    await writeJson(projectId, `voice-${hash}.json`, alignment);
  }

  const ends = alignment!.character_end_times_seconds;
  const duration = ends.length ? ends[ends.length - 1] : 0;
  return mutateProject(projectId, (p) => {
    const s = p.segments?.find((x) => x.id === segmentId);
    if (s) s.voice = { file, text, voiceId: v.voiceId, model: v.model, duration, words: alignmentToWords(alignment!) };
  });
}

/** Clips voiced before Step 14 have no word timings yet: add them from the cached alignment files. */
export async function backfillVoiceWords(projectId: string) {
  const project = await readProject(projectId);
  const missing = (project?.segments ?? []).filter((s) => s.voice && !s.voice.words);
  if (!missing.length) return project;
  const words = new Map<string, ReturnType<typeof alignmentToWords>>();
  for (const s of missing) {
    const alignment = await readJson<Alignment>(projectId, s.voice!.file.replace(/\.mp3$/, ".json"));
    if (alignment) words.set(s.voice!.file, alignmentToWords(alignment));
  }
  if (!words.size) return project;
  return mutateProject(projectId, (p) => {
    for (const s of p.segments ?? []) if (s.voice && !s.voice.words && words.has(s.voice.file)) s.voice.words = words.get(s.voice.file);
  });
}
