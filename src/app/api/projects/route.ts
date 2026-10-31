import { listProjects } from "@/lib/projects";

export async function GET() {
  return Response.json(await listProjects());
}
