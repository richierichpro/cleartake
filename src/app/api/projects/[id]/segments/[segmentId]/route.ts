import { newCutId } from "@/lib/edits";
import { mutateProject, readProject } from "@/lib/projects";

// Edits one paragraph: { text?: string, deleted?: boolean }. Never generates voice.
// deleted: true adds a cut for its range (or merges a hand-added paragraph into the previous one);
// deleted: false removes that cut.
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]/segments/[segmentId]">) {
  const { id, segmentId } = await ctx.params;
  const project = await readProject(id);
  if (!project?.segments?.some((s) => s.id === segmentId)) {
    return Response.json({ error: "Paragraph not found" }, { status: 404 });
  }
  const body = (await req.json()) as { text?: unknown; deleted?: unknown };
  const updated = await mutateProject(id, (p) => {
    const segs = p.segments!;
    const i = segs.findIndex((x) => x.id === segmentId);
    const s = segs[i];
    if (typeof body.text === "string") s.text = body.text.slice(0, 5000);

    if (body.deleted === true) {
      if (!s.originalText && i > 0) {
        // Added with "+ Add" and never recorded: merge its video back into the previous paragraph.
        segs[i - 1].end = s.end;
        segs[i - 1].breakReason = s.breakReason;
        segs[i - 1].pauseAfter = s.pauseAfter;
        segs.splice(i, 1);
      } else {
        // Deleting a paragraph cuts its video range (restorable from the timeline or the script).
        p.cuts = [...(p.cuts ?? []), { id: newCutId(), start: s.start, end: s.end, segmentId: s.id }];
      }
    } else if (body.deleted === false) {
      p.cuts = (p.cuts ?? []).filter((c) => c.segmentId !== s.id);
      delete s.deleted; // legacy flag
    }
  });
  return Response.json(updated);
}
