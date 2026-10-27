import fs from "node:fs/promises";
import { mutateProject, projectDir, readProject } from "@/lib/projects";
import { isRunning } from "@/lib/pipeline";
import { voiceOf } from "@/lib/voice-settings";
import type { Cut, Project, VoiceSettings } from "@/lib/types";

const ACTIVE = ["transcribing", "writing", "voicing"];

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  let project = await readProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // The server restarted mid-processing: surface it so the user can retry.
  if (ACTIVE.includes(project.status) && !isRunning(id)) {
    project = await mutateProject(id, (p) => {
      p.error = { step: p.status, message: "Processing was interrupted (the server restarted)." };
      p.status = "error";
    });
  }
  return Response.json(project);
}

// Editable project settings: title, voice, edit (cuts / trim / splits, Step 9).
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json()) as {
    title?: string;
    voice?: Partial<VoiceSettings>;
    edit?: { cuts?: unknown; trim?: unknown; splits?: unknown };
  };
  const project = await mutateProject(id, (p) => {
    if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 120);
    if (body.edit) applyEdit(p, body.edit);
    if (body.voice) {
      const { mode, voiceId, voiceName } = body.voice;
      p.voice = {
        ...voiceOf(p),
        ...(mode === "ai" || mode === "original" ? { mode } : {}),
        ...(typeof voiceId === "string" && typeof voiceName === "string" ? { voiceId, voiceName } : {}),
      };
    }
  });
  return Response.json(project);
}

// Deletes the whole project folder (video, audio, transcript, everything).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });
  if (isRunning(id)) {
    return Response.json({ error: "This project is still processing. Try again when it finishes." }, { status: 409 });
  }
  await fs.rm(projectDir(id), { recursive: true, force: true });
  return Response.json({ ok: true });
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Validates and replaces cuts / trim / splits (all source seconds, clamped to the video). */
function applyEdit(p: Project, edit: { cuts?: unknown; trim?: unknown; splits?: unknown }) {
  const d = p.video.duration;
  const clamp = (t: number) => Math.max(0, Math.min(d, t));
  if (Array.isArray(edit.cuts)) {
    p.cuts = edit.cuts
      .map((c): Cut | null => {
        const start = num(c?.start);
        const end = num(c?.end);
        if (start === null || end === null || typeof c?.id !== "string") return null;
        const cut: Cut = { id: c.id, start: clamp(Math.min(start, end)), end: clamp(Math.max(start, end)) };
        if (typeof c.segmentId === "string") cut.segmentId = c.segmentId;
        return cut.end - cut.start > 0.05 ? cut : null;
      })
      .filter((c): c is Cut => c !== null);
  }
  if (edit.trim === null) delete p.trim;
  else if (edit.trim && typeof edit.trim === "object") {
    const t = edit.trim as { start?: unknown; end?: unknown };
    const start = clamp(num(t.start) ?? 0);
    const end = clamp(num(t.end) ?? d);
    if (end - start > 0.5) p.trim = { start, end };
  }
  if (Array.isArray(edit.splits)) {
    p.splits = [...new Set(edit.splits.map(num).filter((t): t is number => t !== null && t > 0 && t < d))].sort((a, b) => a - b);
  }
}
