import { extractAudio } from "./ffmpeg";
import { uploadAudio, submitTranscript, waitForTranscript } from "./assemblyai";
import { mutateProject, projectFile, readJson, readProject, writeJson } from "./projects";
import { rewriteScript } from "./rewrite";
import { buildSegments } from "./segments";
import { analyzeActivity } from "./motion";
import { generateSegmentVoice } from "./voice";
import { clipStatus, voiceOf } from "./voice-settings";
import type { ProjectStatus, Transcript } from "./types";

// Processing runs in the background inside the Next server process.
// The Processing screen polls project.json for status + statusDetail.
// Kept on globalThis: in dev, each route can load its own copy of this module, and they must all see
// the same jobs (otherwise GET /projects/[id] thinks a running job was interrupted).
const jobs = globalThis as unknown as { demopolishProcessing?: Set<string> };
const running = (jobs.demopolishProcessing ??= new Set<string>());

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

    if (!(await readJson(id, "motion.json"))) {
      await setStatus(id, step, "Analyzing screen activity…");
      await analyzeActivity(id);
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

    // Record the AI voice right away, so the first preview already talks. A failure here (no key,
    // out of credits) doesn't fail processing: the editor can generate it later.
    const scripted = (await readProject(id))!;
    const v = voiceOf(scripted);
    const todo =
      v.mode === "ai" ? (scripted.segments ?? []).filter((seg) => ["none", "outdated"].includes(clipStatus(seg, v))) : [];
    let voiced = false;
    let voiceProblem = "";
    if (todo.length) {
      step = "voicing";
      try {
        for (const [i, seg] of todo.entries()) {
          await setStatus(id, step, `Recording the AI voice (${i + 1} of ${todo.length})…`);
          await generateSegmentVoice(id, seg.id);
        }
        voiced = true;
      } catch (err) {
        voiceProblem = err instanceof Error ? err.message : String(err);
      }
    }

    step = "ready";
    await setStatus(
      id,
      step,
      !words
        ? "No speech found. You can write the narration in the editor and an AI voice will read it."
        : voiceProblem
          ? `Script ready. The AI voice will be generated in the editor (${voiceProblem})`
          : `Transcribed ${words} words, polished the script${voiced ? " and recorded the AI voice" : ""}`,
    );
  } catch (err) {
    await mutateProject(id, (p) => {
      p.status = "error";
      p.error = { step, message: err instanceof Error ? err.message : String(err) };
    }).catch(() => {});
  }
}
