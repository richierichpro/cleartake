import fsp from "node:fs/promises";
import { mutateProject, projectFile, readProject } from "@/lib/projects";

// The browser grabs a frame while reading the video and posts it here as a JPEG.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/thumbnail">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });

  await fsp.writeFile(projectFile(id, "thumb.jpg"), Buffer.from(await req.arrayBuffer()));
  const project = await mutateProject(id, (p) => {
    p.thumbnail = "thumb.jpg";
  });
  return Response.json(project);
}
