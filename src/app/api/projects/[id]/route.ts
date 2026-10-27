import { readProject, writeProject } from "@/lib/projects";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(project);
}

// Only the title is editable for now; later steps add their own fields.
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json()) as { title?: string };
  if (typeof body.title === "string" && body.title.trim()) {
    project.title = body.title.trim().slice(0, 120);
  }
  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  return Response.json(project);
}
