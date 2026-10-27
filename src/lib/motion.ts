import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { projectFile, readProject, writeJson } from "./projects";
import { SYNC_CONFIG, type Motion } from "./sync";

/**
 * Samples the recording at SYNC_CONFIG.fps as small grayscale frames and scores motion:
 * % of pixels that changed (beyond pixelThreshold) vs the previous frame.
 * Saves motion.json (scores) and frames.gray (raw frames, reused by zoom detection in Step 12).
 */
export async function analyzeActivity(projectId: string): Promise<Motion> {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");
  const c = SYNC_CONFIG;
  const width = c.frameWidth;
  const height = Math.max(2, Math.round((width * project.video.height) / project.video.width / 2) * 2);

  const raw = await new Promise<Buffer>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", projectFile(projectId, project.video.file),
      "-vf", `fps=${c.fps},scale=${width}:${height},format=gray`,
      "-f", "rawvideo", "-",
    ]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === "ENOENT" ? "ffmpeg isn't installed. Run: brew install ffmpeg" : e.message)),
    );
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg failed: ${stderr.trim().slice(-200)}`))));
  });

  const size = width * height;
  const frames = Math.floor(raw.length / size);
  const scores = [0];
  for (let f = 1; f < frames; f++) {
    let changed = 0;
    for (let p = 0, a = (f - 1) * size, b = f * size; p < size; p++) {
      if (Math.abs(raw[a + p] - raw[b + p]) > c.pixelThreshold) changed++;
    }
    scores.push(Math.round((changed / size) * 10000) / 100);
  }

  const motion: Motion = { fps: c.fps, width, height, frames, scores };
  await fs.writeFile(projectFile(projectId, "frames.gray"), raw.subarray(0, frames * size));
  await writeJson(projectId, "motion.json", motion);
  return motion;
}
