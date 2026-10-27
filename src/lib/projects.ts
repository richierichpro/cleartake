import fs from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import type { Project } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data", "projects");

export const newProjectId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

const SAFE_NAME = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/;

export function projectDir(id: string) {
  if (!SAFE_NAME.test(id)) throw new Error("Invalid project id");
  return path.join(DATA_DIR, id);
}

/** Resolves a file inside a project folder, rejecting anything that could escape it. */
export function projectFile(id: string, name: string) {
  if (!SAFE_NAME.test(name)) throw new Error("Invalid file name");
  return path.join(projectDir(id), name);
}

export async function readProject(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(projectFile(id, "project.json"), "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function writeProject(project: Project) {
  const file = projectFile(project.id, "project.json");
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2));
  await fs.rename(tmp, file);
}

export async function listProjects(): Promise<Project[]> {
  let ids: string[] = [];
  try {
    ids = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const projects = await Promise.all(ids.filter((id) => SAFE_NAME.test(id)).map(readProject));
  return projects
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
