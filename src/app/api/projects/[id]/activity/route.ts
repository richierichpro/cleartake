import { analyzeActivity } from "@/lib/motion";
import { readProject } from "@/lib/projects";

// Samples frames with ffmpeg and saves motion.json + frames.gray. Free (local), ~0.1s per second of video.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/activity">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    return Response.json(await analyzeActivity(id));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 });
  }
}
