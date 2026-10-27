import { readProject, writeJson } from "@/lib/projects";
import { suggestZooms } from "@/lib/zoom-suggest";

// Suggests zooms from narration + OCR (with screen changes as backup) and caches zoom-suggestions.json.
// Takes a few seconds: one LLM call, a few OCR frames. The first run also compiles the OCR helper.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/zoom-candidates">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    const suggestions = await suggestZooms(id);
    await writeJson(id, "zoom-suggestions.json", suggestions);
    return Response.json(suggestions);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Zoom detection failed" }, { status: 500 });
  }
}
