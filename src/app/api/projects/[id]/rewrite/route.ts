import { mutateProject, readProject } from "@/lib/projects";
import { rewriteScript } from "@/lib/rewrite";

// Runs the AI rewrite on all segments and applies it. Takes a few seconds.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/rewrite">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!project.segments?.length) return Response.json({ error: "There's no script to rewrite yet" }, { status: 400 });

  try {
    const result = await rewriteScript(project, project.keyterms);
    const updated = await mutateProject(id, (p) => {
      p.segments = result.segments;
      p.rewrite = { model: result.model ?? "", at: new Date().toISOString(), missing: result.missing };
    });
    return Response.json(updated);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Rewrite failed" }, { status: 502 });
  }
}
