import { isExporting, startExport } from "@/lib/export";
import { mutateProject, readProject } from "@/lib/projects";

// GET: current export state. POST: start a new export.
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/export">) {
  const { id } = await ctx.params;
  let project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  // The server restarted mid-render.
  if (project.export?.status === "rendering" && !isExporting(id)) {
    project = await mutateProject(id, (p) => {
      p.export = { ...p.export!, status: "error", stage: "Failed", error: "The export was interrupted. Try again." };
    });
  }
  return Response.json(project.export ?? null);
}

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/export">) {
  const { id } = await ctx.params;
  try {
    await startExport(id, new URL(req.url).origin);
    return Response.json((await readProject(id))?.export ?? null);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed to start" }, { status: 409 });
  }
}
