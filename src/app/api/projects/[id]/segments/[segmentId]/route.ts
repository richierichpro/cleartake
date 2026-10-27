import { mutateProject, readProject } from "@/lib/projects";

// Edits one paragraph: { text?: string, deleted?: boolean }. Never generates voice.
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]/segments/[segmentId]">) {
  const { id, segmentId } = await ctx.params;
  const project = await readProject(id);
  if (!project?.segments?.some((s) => s.id === segmentId)) {
    return Response.json({ error: "Paragraph not found" }, { status: 404 });
  }
  const body = (await req.json()) as { text?: unknown; deleted?: unknown };
  const updated = await mutateProject(id, (p) => {
    const s = p.segments!.find((x) => x.id === segmentId)!;
    if (typeof body.text === "string") s.text = body.text.slice(0, 5000);
    if (typeof body.deleted === "boolean") s.deleted = body.deleted;
  });
  return Response.json(updated);
}
