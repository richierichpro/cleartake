import { extractAudio } from "./ffmpeg";
import { uploadAudio, submitTranscript, waitForTranscript } from "./assemblyai";
import { mutateProject, projectFile, readJson, readProject, writeJson } from "./projects";
import { rewriteScript } from "./rewrite";
import { buildSegments } from "./segments";
import type { ProjectStatus, Transcript } from "./types";

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

    // A retry after a later step failed doesn't transcribe (and pay) again.
    let transcript = await readJson<Transcript>(id, "transcript.json");
    const transcribedNow = !transcript;
    if (!transcript) {
      await setStatus(id, step, "Extracting audio from your recording…");
      await extractAudio(projectFile(id, project.video.file), projectFile(id, "audio.mp3"));

      await setStatus(id, step, "Uploading audio…");
      const audioUrl = await uploadAudio(projectFile(id, "audio.mp3"));

      await setStatus(id, step, "Queued for transcription…");
      const transcriptId = await submitTranscript(audioUrl, project.keyterms ?? []);
      transcript = await waitForTranscript(transcriptId, (s) =>
        setStatus(id, step, s === "queued" ? "Queued for transcription…" : "Listening to your voiceover…"),
      );
      await writeJson(id, "transcript.json", transcript);
    }
    const { words: transcriptWords } = transcript;
    if (transcribedNow || !project.segments) {
      await mutateProject(id, (p) => {
        p.segments = buildSegments(transcriptWords, p.video.duration);
      });
    }

    step = "writing";
    const words = transcript.words.length;
    if (words) {
      await setStatus(id, step, "Polishing your script…");
      const fresh = (await readProject(id))!;
      const result = await rewriteScript(fresh, fresh.keyterms);
      await mutateProject(id, (p) => {
        p.segments = result.segments;
        p.rewrite = { model: result.model ?? "", at: new Date().toISOString(), missing: result.missing };
      });
    }

    // Voice generation plugs in here in Step 5.
    step = "ready";
    await setStatus(
      id,
      step,
      words
        ? `Transcribed ${words} words and polished the script`
        : "No speech found. Was your microphone on while recording?",
    );
  } catch (err) {
    await mutateProject(id, (p) => {
      p.status = "error";
      p.error = { step, message: err instanceof Error ? err.message : String(err) };
    }).catch(() => {});
  }
}
