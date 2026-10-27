import { extractAudio } from "./ffmpeg";
import { uploadAudio, submitTranscript, waitForTranscript } from "./assemblyai";
import { mutateProject, projectFile, readProject, writeJson } from "./projects";
import type { ProjectStatus } from "./types";

// Processing runs in the background inside the Next server process.
// The Processing screen polls project.json for status + statusDetail.
const running = new Set<string>();

export const isRunning = (id: string) => running.has(id);

export function startProcessing(id: string) {
  if (running.has(id)) return;
  running.add(id);
  runPipeline(id).finally(() => running.delete(id));
}

function setStatus(id: string, status: ProjectStatus, statusDetail = "") {
  return mutateProject(id, (p) => {
    if (p.status !== status) p.stepStartedAt = new Date().toISOString();
    p.status = status;
    p.statusDetail = statusDetail;
    p.error = null;
  });
}

async function runPipeline(id: string) {
  let step: ProjectStatus = "transcribing";
  try {
    const project = await readProject(id);
    if (!project) return;

    await setStatus(id, step, "Extracting audio from your recording…");
    await extractAudio(projectFile(id, project.video.file), projectFile(id, "audio.mp3"));

    await setStatus(id, step, "Uploading audio…");
    const audioUrl = await uploadAudio(projectFile(id, "audio.mp3"));

    await setStatus(id, step, "Queued for transcription…");
    const transcriptId = await submitTranscript(audioUrl, project.keyterms ?? []);
    const transcript = await waitForTranscript(transcriptId, (s) =>
      setStatus(id, step, s === "queued" ? "Queued for transcription…" : "Listening to your voiceover…"),
    );
    await writeJson(id, "transcript.json", transcript);

    // Script rewrite and voice generation plug in here in later steps.
    step = "ready";
    await setStatus(id, step, `Transcribed ${transcript.words.length} words`);
  } catch (err) {
    await mutateProject(id, (p) => {
      p.status = "error";
      p.error = { step, message: err instanceof Error ? err.message : String(err) };
    }).catch(() => {});
  }
}
