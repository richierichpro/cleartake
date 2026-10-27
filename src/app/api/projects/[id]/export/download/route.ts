import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { downloadName } from "@/lib/export";
import { projectFile, readProject } from "@/lib/projects";

// Streams the latest export as an attachment named "{project title}.mp4".
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/export/download">) {
  const { id } = await ctx.params;
  const project = await readProject(id);
  const file = project?.export?.status === "done" ? project.export.file : undefined;
  if (!project || !file) return Response.json({ error: "No finished export" }, { status: 404 });
  const stat = await fsp.stat(projectFile(id, file)).catch(() => null);
  if (!stat) return Response.json({ error: "The export file is missing. Export again." }, { status: 404 });

  const name = downloadName(project.title);
  return new Response(Readable.toWeb(fs.createReadStream(projectFile(id, file))) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
