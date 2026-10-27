import { mutateProject, readJson, readProject } from "@/lib/projects";
import { buildSegments } from "@/lib/segments";
import type { Transcript } from "@/lib/types";

// (Re)builds script segments from transcript.json. Replaces existing segments.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/segments">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  const transcript = await readJson<Transcript>(id, "transcript.json");
  if (!transcript) return Response.json({ error: "Transcribe the recording first" }, { status: 400 });

  const project = await mutateProject(id, (p) => {
    p.segments = buildSegments(transcript.words, p.video.duration);
  });
  return Response.json(project);
}
