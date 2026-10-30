import { composeMusic } from "@/lib/music-ai";
import { readProject } from "@/lib/projects";

// Music tab: compose (or reuse) the background track for a mood. Body: { preset }. Takes ~10–30s.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/music">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  const { preset } = (await req.json().catch(() => ({}))) as { preset?: string };
  try {
    return Response.json(await composeMusic(id, String(preset)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't compose music" }, { status: 502 });
  }
}
