import { isExporting, startExport } from "@/lib/export";
import { mutateProject, readProject } from "@/lib/projects";
import { EXPORT_QUALITIES, type ExportQuality } from "@/remotion/constants";

// GET: current export state. POST { quality?: "1080p" | "1440p" | "original" }: start a new export.
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
  const body = (await req.json().catch(() => ({}))) as { quality?: string };
  const quality = EXPORT_QUALITIES.some((q) => q.id === body.quality) ? (body.quality as ExportQuality) : undefined;
  try {
    await startExport(id, new URL(req.url).origin, quality);
    return Response.json((await readProject(id))?.export ?? null);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed to start" }, { status: 409 });
  }
}
