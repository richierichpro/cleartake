import fs from "node:fs/promises";
import path from "node:path";
import { newProjectId, projectDir, readProject, writeProject } from "@/lib/projects";
import type { Project } from "@/lib/types";

// A ready-made project to explore without recording anything. The template is data/samples/demo
// (saved with scripts/save-sample.mjs); each click gets its own copy, so the template stays untouched.
const SAMPLE = path.join(process.cwd(), "data", "samples", "demo");

async function template() {
  try {
    return JSON.parse(await fs.readFile(path.join(SAMPLE, "project.json"), "utf8")) as Project;
  } catch {
    return null;
  }
}

export async function GET() {
  const t = await template();
  return Response.json(t ? { available: true, title: t.title, duration: t.video.duration } : { available: false });
}

export async function POST() {
  const t = await template();
  if (!t) return Response.json({ error: "No sample project on this machine" }, { status: 404 });
  const id = newProjectId();
  await fs.cp(SAMPLE, projectDir(id), { recursive: true });
  const now = new Date().toISOString();
  await writeProject({ ...t, id, title: `Sample: ${t.title.replace(/^Sample: /, "")}`, createdAt: now, updatedAt: now });
  return Response.json(await readProject(id));
}
