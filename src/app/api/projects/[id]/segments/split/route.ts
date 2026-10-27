import { mutateProject, readProject } from "@/lib/projects";
import type { Segment } from "@/lib/types";

const MIN_PART = 0.5; // seconds each side must keep

// "+ Add": splits the paragraph under the playhead; the new empty paragraph starts at `at`.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/segments/split">) {
  const { id } = await ctx.params;
  const { at } = (await req.json()) as { at: number };
  const project = await readProject(id);
  if (!project?.segments) return Response.json({ error: "No script yet" }, { status: 400 });

  const target = project.segments.find((s) => at > s.start + MIN_PART && at < s.end - MIN_PART);
  if (!target) return Response.json({ error: "Move the playhead inside a paragraph, away from its edges" }, { status: 400 });

  const newId = `p${Date.now().toString(36)}`;
  const updated = await mutateProject(id, (p) => {
    const i = p.segments!.findIndex((s) => s.id === target.id);
    const seg = p.segments![i];
    const added: Segment = {
      id: newId,
      start: at,
      end: seg.end,
      speechStart: at,
      speechEnd: at,
      wordStart: seg.wordEnd,
      wordEnd: seg.wordEnd,
      originalText: "",
      text: "",
      breakReason: seg.breakReason,
      pauseAfter: seg.pauseAfter,
    };
    seg.end = at;
    seg.speechEnd = Math.min(seg.speechEnd, at);
    seg.breakReason = "split";
    p.segments!.splice(i + 1, 0, added);
  });
  return Response.json({ project: updated, id: newId });
}
