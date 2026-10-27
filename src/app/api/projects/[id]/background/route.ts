import fsp from "node:fs/promises";
import { mutateProject, projectFile, readProject } from "@/lib/projects";
import { visualsOf } from "@/lib/visuals";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 15 * 1024 * 1024;

// POST: raw image body → background.{ext}, selected as the background. DELETE: remove it.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/background">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const ext = TYPES[req.headers.get("content-type") ?? ""];
  if (!ext) return Response.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_BYTES) return Response.json({ error: "Image is larger than 15 MB" }, { status: 400 });

  // A new name each time so the browser and the renderer never show a cached old image.
  const file = `background-${Date.now().toString(36)}.${ext}`;
  await fsp.writeFile(projectFile(id, file), data);
  const old = project.visuals?.background.image;
  const updated = await mutateProject(id, (p) => {
    const v = visualsOf(p);
    p.visuals = { ...v, background: { ...v.background, enabled: true, image: file } };
  });
  if (old) await fsp.rm(projectFile(id, old), { force: true });
  return Response.json(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]/background">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const old = project.visuals?.background.image;
  const updated = await mutateProject(id, (p) => {
    const v = visualsOf(p);
    p.visuals = { ...v, background: { ...v.background, image: null } };
  });
  if (old) await fsp.rm(projectFile(id, old), { force: true });
  return Response.json(updated);
}
