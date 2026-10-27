import fsp from "node:fs/promises";
import { projectFile, readProject, writeProject } from "@/lib/projects";

// The browser grabs a frame while reading the video and posts it here as a JPEG.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  await fsp.writeFile(projectFile(id, "thumb.jpg"), Buffer.from(await req.arrayBuffer()));
  project.thumbnail = "thumb.jpg";
  await writeProject(project);
  return Response.json(project);
}
