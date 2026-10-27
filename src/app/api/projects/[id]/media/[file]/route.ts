import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { projectFile } from "@/lib/projects";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
};

// Node stream → web stream that tolerates the browser cancelling mid-file
// (video seeking does this constantly; Readable.toWeb throws "Controller is already closed").
function toWebStream(node: fs.ReadStream): ReadableStream {
  let closed = false;
  return new ReadableStream({
    start(controller) {
      node.on("data", (chunk) => {
        if (closed) return;
        controller.enqueue(chunk);
        if ((controller.desiredSize ?? 1) <= 0) node.pause();
      });
      node.on("end", () => {
        if (!closed) controller.close();
        closed = true;
      });
      node.on("error", (err) => {
        if (!closed) controller.error(err);
        closed = true;
      });
    },
    pull() {
      node.resume();
    },
    cancel() {
      closed = true;
      node.destroy();
    },
  });
}

// Serves files from a project folder with HTTP Range support so the video can seek.
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/media/[file]">) {
  const { id, file } = await ctx.params;
  let filePath: string;
  try {
    filePath = projectFile(id, file);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  };

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    return new Response(toWebStream(fs.createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(toWebStream(fs.createReadStream(filePath)), {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
