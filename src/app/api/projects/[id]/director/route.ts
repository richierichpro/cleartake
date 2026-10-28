import { runDirector } from "@/lib/director-ai";
import { readProject } from "@/lib/projects";

// Step 15: the AI director pass (one LLM call). Saves the plan on the project for review.
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/director">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    return Response.json(await runDirector(id));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "The director pass failed" }, { status: 502 });
  }
}
