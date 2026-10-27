import { generateSegmentVoice } from "@/lib/voice";

// Generates the AI voice clip for one paragraph (cached by text + voice).
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/voice/[segmentId]">) {
  const { id, segmentId } = await ctx.params;
  try {
    return Response.json(await generateSegmentVoice(id, segmentId));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Voice generation failed" }, { status: 502 });
  }
}
