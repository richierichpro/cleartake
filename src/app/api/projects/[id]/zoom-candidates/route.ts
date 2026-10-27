import fsp from "node:fs/promises";
import { projectFile, readJson, readProject, writeJson } from "@/lib/projects";
import { detectZoomCandidates } from "@/lib/zoom-detect";
import type { Motion } from "@/lib/sync";

// Runs zoom detection on the saved frames (Step 6) and caches zoom-candidates.json. Local and fast.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/zoom-candidates">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  const motion = await readJson<Motion>(id, "motion.json");
  const raw = await fsp.readFile(projectFile(id, "frames.gray")).catch(() => null);
  if (!motion || !raw) return Response.json({ error: "Analyze screen activity first (Debug → Re-analyze screen)" }, { status: 400 });

  const detection = detectZoomCandidates(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), motion);
  await writeJson(id, "zoom-candidates.json", detection);
  return Response.json(detection);
}
