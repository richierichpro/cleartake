import fs from "node:fs/promises";
import { mutateProject, projectDir, readProject } from "@/lib/projects";
import { isRunning } from "@/lib/pipeline";

const ACTIVE = ["transcribing", "writing", "voicing"];

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  let project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // The server restarted mid-processing: surface it so the user can retry.
  if (ACTIVE.includes(project.status) && !isRunning(id)) {
    project = await mutateProject(id, (p) => {
      p.error = { step: p.status, message: "Processing was interrupted (the server restarted)." };
      p.status = "error";
    });
  }
  return Response.json(project);
}

// Only the title is editable for now; later steps add their own fields.
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json()) as { title?: string };
  const project = await mutateProject(id, (p) => {
    if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 120);
  });
  return Response.json(project);
}

// Deletes the whole project folder (video, audio, transcript, everything).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  if (isRunning(id)) {
    return Response.json({ error: "This project is still processing. Try again when it finishes." }, { status: 409 });
  }
  await fs.rm(projectDir(id), { recursive: true, force: true });
  return Response.json({ ok: true });
}
