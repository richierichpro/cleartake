import { mutateProject, readJson, readProject } from "@/lib/projects";
import { blankSegment, buildSegments } from "@/lib/segments";
import { voiceOf } from "@/lib/voice-settings";
import type { Transcript } from "@/lib/types";

// (Re)builds script segments from transcript.json. Replaces existing segments.
// { blank: true }: no narration in the recording, so start one empty paragraph over the whole video for
// the user to write, voiced by the AI.
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/segments">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { blank?: boolean };
  if (body.blank) {
    const project = await mutateProject(id, (p) => {
      if (p.segments?.some((s) => s.text.trim())) return; // never wipe a script
      p.segments = [blankSegment(p.video.duration)];
      p.voice = { ...voiceOf(p), mode: "ai" }; // there's no original voice to keep
    });
    return Response.json(project);
  }
  const transcript = await readJson<Transcript>(id, "transcript.json");
  if (!transcript) return Response.json({ error: "Transcribe the recording first" }, { status: 400 });

  const project = await mutateProject(id, (p) => {
    p.segments = buildSegments(transcript.words, p.video.duration);
  });
  return Response.json(project);
}
