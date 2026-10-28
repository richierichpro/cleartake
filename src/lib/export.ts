import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";

import { mutateProject, projectFile, readJson, readProject, writeJson } from "./projects";
import { buildSyncPlan, identityPlan, type Motion } from "./sync";
import { voiceOf } from "./voice-settings";
import { frameProps } from "./visuals";
import { outputZooms } from "./zooms";
import { buildCaptions, captionsOn } from "./captions";
import { compositionSize, DEFAULT_QUALITY, FPS, type ExportQuality } from "@/remotion/constants";
import type { RenderProps } from "@/remotion/root";
import type { Transcript } from "./types";

// Exports render in a child Node process (scripts/render.mjs). This module starts it,
// forwards its progress into project.json, and cleans up old export files.
const running = new Map<string, ChildProcess>();

export const isExporting = (id: string) => running.has(id);

export async function startExport(id: string, origin: string, quality: ExportQuality = DEFAULT_QUALITY) {
  if (running.has(id)) throw new Error("An export is already running");
  const project = await readProject(id);
  if (!project) throw new Error("Project not found");

  // The same plan the editor's Player shows.
  const motion = await readJson<Motion>(id, "motion.json");
  const transcript = await readJson<Transcript>(id, "transcript.json");
  const plan = motion ? buildSyncPlan(project, transcript?.words ?? [], motion) : identityPlan(project);
  const media = (file: string) => `${origin}/api/projects/${id}/media/${file}`;
  const frame = frameProps(project, media);
  const size = compositionSize(project.video.width, project.video.height, quality, frame.framed);
  const props: RenderProps = {
    videoSrc: media(project.video.file),
    pieces: plan.pieces,
    voice: plan.voice.map((v) => ({ src: media(v.file), outputStart: v.outputStart, duration: v.duration })),
    muteOriginal: voiceOf(project).mode === "ai",
    frame,
    zooms: outputZooms(project, plan),
    captions: captionsOn(project) ? buildCaptions(project, plan) : [],
    ...size,
    durationInFrames: Math.max(1, Math.round(plan.outputDuration * FPS)),
  };
  await writeJson(id, "export-props.json", props);

  const file = `export-${Date.now()}.mp4`;
  const previous = project.export?.file;
  await mutateProject(id, (p) => {
    p.export = { status: "rendering", quality, ...size, stage: "Starting…", progress: 0, startedAt: new Date().toISOString() };
  });

  const child = spawn(process.execPath, ["scripts/render.mjs", projectFile(id, "export-props.json"), projectFile(id, file)], {
    cwd: process.cwd(),
  });
  running.set(id, child);

  let lastSaved = 0;
  let failure = "";
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("@@")) continue;
      const msg = JSON.parse(line.slice(2)) as { stage?: string; progress?: number; error?: string };
      if (msg.error) failure = msg.error;
      // Throttle writes: stage changes always, progress every 2%.
      if (msg.stage || (msg.progress !== undefined && msg.progress - lastSaved >= 0.02)) {
        if (msg.progress !== undefined) lastSaved = msg.progress;
        mutateProject(id, (p) => {
          if (p.export?.status !== "rendering") return;
          if (msg.stage) p.export.stage = msg.stage;
          if (msg.progress !== undefined) p.export.progress = msg.progress;
        }).catch(() => {});
      }
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));

  child.on("close", async (code) => {
    running.delete(id);
    const out = await fs.stat(projectFile(id, file)).catch(() => null);
    if (code === 0 && out) {
      if (previous && previous !== file) await fs.rm(projectFile(id, previous), { force: true });
      await mutateProject(id, (p) => {
        p.export = {
          ...p.export!,
          status: "done",
          stage: "Done",
          progress: 1,
          finishedAt: new Date().toISOString(),
          file,
          size: out.size,
          duration: plan.outputDuration,
        };
      });
    } else {
      await fs.rm(projectFile(id, file), { force: true });
      const message = failure || stderr.trim().split("\n").pop() || `Renderer exited with code ${code}`;
      await mutateProject(id, (p) => {
        p.export = { ...p.export!, status: "error", stage: "Failed", error: message, finishedAt: new Date().toISOString() };
      }).catch(() => {});
    }
  });
}

/** "{project title}.mp4", safe for a Content-Disposition header. */
export function downloadName(title: string) {
  const base = title.replace(/[\\/:*?"<>|]+/g, "").trim() || "demo";
  return `${base}.mp4`;
}

