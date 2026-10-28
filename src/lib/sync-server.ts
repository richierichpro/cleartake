import { readJson } from "./projects";
import { buildSyncPlan, identityPlan, type Motion } from "./sync";
import type { Project, Transcript } from "./types";

/** The same sync plan the editor's Player shows, built on the server (export, director). */
export async function loadSyncPlan(project: Project) {
  const motion = await readJson<Motion>(project.id, "motion.json");
  const transcript = await readJson<Transcript>(project.id, "transcript.json");
  const words = transcript?.words ?? [];
  return { plan: motion ? buildSyncPlan(project, words, motion) : identityPlan(project), words };
}
