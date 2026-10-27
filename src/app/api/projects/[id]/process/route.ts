import { mutateProject, readProject } from "@/lib/projects";
import { isRunning, startProcessing } from "@/lib/pipeline";

// Starts (or retries) processing. Body: { keyterms: string[] }
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/process">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  if (isRunning(id)) return Response.json({ error: "Already processing" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { keyterms?: unknown };
  const keyterms = Array.isArray(body.keyterms)
    ? body.keyterms
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t && t.split(/\s+/).length <= 6)
        .slice(0, 100)
    : undefined;

  const project = await mutateProject(id, (p) => {
    if (keyterms) p.keyterms = keyterms;
    p.status = "transcribing";
    p.statusDetail = "Starting…";
    p.stepStartedAt = new Date().toISOString();
    p.error = null;
  });
  startProcessing(id);
  return Response.json(project);
}
