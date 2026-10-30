import { extractAudio } from "./ffmpeg";
import { uploadAudio, submitTranscript, waitForTranscript } from "./assemblyai";
import { mutateProject, projectFile, readJson, readProject, writeJson } from "./projects";
import { rewriteScript } from "./rewrite";
import { buildSegments } from "./segments";
import { analyzeActivity } from "./motion";
import { generateSegmentVoice } from "./voice";
import { clipStatus, voiceOf } from "./voice-settings";
import { runDirector } from "./director-ai";
import { loadSyncPlan } from "./sync-server";
import { suggestZooms } from "./zoom-suggest";
import { outputZooms, zoomsFromSuggestions } from "./zooms";
import type { ProjectStatus, Transcript } from "./types";

// Processing runs in the background inside the Next server process.
// The Processing screen polls project.json for status + statusDetail.
// Kept on globalThis: in dev, each route can load its own copy of this module, and they must all see
// the same jobs (otherwise GET /projects/[id] thinks a running job was interrupted).
const jobs = globalThis as unknown as { cleartakeProcessing?: Set<string> };
const running = (jobs.cleartakeProcessing ??= new Set<string>());

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

    // The finishing touches, so the result is ready to watch without a click: zooms on what you name,
    // captions, title cards and step labels. Each is skipped if it's already there (a retry never
    // overwrites your edits), and a failure only means doing it in the editor.
    if (words && voiced) {
      step = "polishing";
      await polish(id).catch(() => {});
    }

    step = "ready";
    await setStatus(
      id,
      step,
      !words
        ? "No speech found. You can write the narration in the editor and an AI voice will read it."
        : voiceProblem
          ? `Script ready. The AI voice will be generated in the editor (${voiceProblem})`
          : voiced
            ? `Transcribed ${words} words, rewrote the script, recorded the AI voice and added the finishing touches`
            : `Transcribed ${words} words and polished the script`,
    );
  } catch (err) {
    await mutateProject(id, (p) => {
      p.status = "error";
      p.error = { step, message: err instanceof Error ? err.message : String(err) };
    }).catch(() => {});
  }
}

async function polish(id: string) {
  await setStatus(id, "polishing", "Finding what to zoom in on…");
  const project = (await readProject(id))!;
  if (!project.zooms?.items.length) {
    try {
      const suggestions = await suggestZooms(id);
      await writeJson(id, "zoom-suggestions.json", suggestions);
      const { plan } = await loadSyncPlan(project);
      const added = zoomsFromSuggestions(suggestions.candidates, plan, outputZooms(project, plan));
      if (added.length) await mutateProject(id, (p) => void (p.zooms = { enabled: true, items: added }));
    } catch {
      // No zooms: they can be added in the editor.
    }
  }

  await setStatus(id, "polishing", "Writing the title card and step labels…");
  if (!project.director) await runDirector(id).catch(() => {});

  // Captions follow the AI voice; on unless you turned them off.
  await mutateProject(id, (p) => {
    if (!p.captions && voiceOf(p).mode === "ai") p.captions = { enabled: true };
  });
}
