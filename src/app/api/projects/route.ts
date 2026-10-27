import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { NextRequest } from "next/server";
import { listProjects, newProjectId, projectDir, projectFile, writeProject } from "@/lib/projects";
import { titleFromFileName } from "@/lib/format";
import type { Project } from "@/lib/types";

const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v", "mkv"];

export async function GET() {
  return Response.json(await listProjects());
}

// Upload: the raw video is the request body (streamed to disk, so large files are fine).
// Metadata read in the browser comes in the query string.
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const name = q.get("name") ?? "recording.mp4";
  const mimeType = request.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("video/") || !request.body) {
    return Response.json({ error: "Please upload a video file." }, { status: 400 });
  }

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const file = `original.${VIDEO_EXTS.includes(ext) ? ext : "mp4"}`;
  const id = newProjectId();
  await fsp.mkdir(projectDir(id), { recursive: true });

  try {
    await pipeline(
      Readable.fromWeb(request.body as NodeReadableStream),
      fs.createWriteStream(projectFile(id, file)),
    );
  } catch {
    await fsp.rm(projectDir(id), { recursive: true, force: true });
    return Response.json({ error: "Upload was interrupted." }, { status: 500 });
  }

  const { size } = await fsp.stat(projectFile(id, file));
  const now = new Date().toISOString();
  const project: Project = {
    id,
    title: titleFromFileName(name),
    createdAt: now,
    updatedAt: now,
    status: "uploaded",
    video: {
      file,
      mimeType,
      size,
      duration: Number(q.get("duration")) || 0,
      width: Number(q.get("width")) || 1920,
      height: Number(q.get("height")) || 1080,
    },
    thumbnail: null,
  };
  await writeProject(project);
  return Response.json(project);
}
