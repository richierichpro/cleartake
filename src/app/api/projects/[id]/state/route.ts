import { EDITABLE } from "@/lib/history";
import { mutateProject, readProject } from "@/lib/projects";

// Undo / redo: replaces everything you edit with the restored snapshot in one write.
// A key missing from the body was absent in that snapshot, so it's removed.
export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/state">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || (body.segments !== undefined && !Array.isArray(body.segments))) {
    return Response.json({ error: "Invalid state" }, { status: 400 });
  }
  const project = await mutateProject(id, (p) => {
    const target = p as unknown as Record<string, unknown>;
    for (const key of EDITABLE) {
      if (body[key] === undefined || body[key] === null) delete target[key];
      else target[key] = body[key];
    }
  });
  return Response.json(project);
}
