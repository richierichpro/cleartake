import fs from "node:fs/promises";
import { mutateProject, projectDir, readProject } from "@/lib/projects";
import { isRunning } from "@/lib/pipeline";
import { cleanPlan } from "@/lib/director";
import { backfillVoiceWords } from "@/lib/voice";
import { voiceOf } from "@/lib/voice-settings";
import { BACKGROUND_PRESETS, PADDING_MAX, RADIUS_MAX, SHADOWS, visualsOf } from "@/lib/visuals";
import { ZOOM_LIMITS } from "@/lib/zooms";
import type { Cut, Project, Visuals, VoiceSettings, Zoom } from "@/lib/types";

const ACTIVE = ["transcribing", "writing", "voicing", "polishing"];

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  let project = await backfillVoiceWords(id);
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

// Editable project settings: title, voice, edit (cuts / trim / splits, Step 9), visuals (Step 10), zooms (Step 13),
// captions (Step 14), director plan edits and scenes (Step 15).
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!(await readProject(id))) return Response.json({ error: "Project not found" }, { status: 404 });

  const body = (await req.json()) as {
    title?: string;
    voice?: Partial<VoiceSettings>;
    edit?: { cuts?: unknown; trim?: unknown; splits?: unknown };
    visuals?: { background?: { enabled?: unknown; preset?: unknown }; shadow?: unknown; radius?: unknown; padding?: unknown };
    zooms?: { enabled?: unknown; items?: unknown };
    captions?: { enabled?: unknown };
    director?: unknown;
    scenes?: { intro?: unknown; outro?: unknown; flyIn?: unknown };
  };
  const project = await mutateProject(id, (p) => {
    if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 120);
    if (body.edit) applyEdit(p, body.edit);
    if (body.visuals) applyVisuals(p, body.visuals);
    if (body.zooms) applyZooms(p, body.zooms);
    if (typeof body.captions?.enabled === "boolean") p.captions = { enabled: body.captions.enabled };
    // The user's edits to the AI plan replace its content; when and how it was made stays.
    if (body.director && p.director) p.director = { ...p.director, ...cleanPlan(body.director) };
    if (body.scenes) {
      const cur = { intro: p.scenes?.intro ?? true, outro: p.scenes?.outro ?? true, flyIn: p.scenes?.flyIn ?? true };
      if (typeof body.scenes.intro === "boolean") cur.intro = body.scenes.intro;
      if (typeof body.scenes.outro === "boolean") cur.outro = body.scenes.outro;
      if (typeof body.scenes.flyIn === "boolean") cur.flyIn = body.scenes.flyIn;
      p.scenes = cur;
    }
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

/** Validates and merges visuals settings. The background image is set by the /background route. */
function applyVisuals(
  p: Project,
  v: { background?: { enabled?: unknown; preset?: unknown }; shadow?: unknown; radius?: unknown; padding?: unknown },
) {
  const next = visualsOf(p);
  if (typeof v.background?.enabled === "boolean") next.background.enabled = v.background.enabled;
  if (BACKGROUND_PRESETS.some((b) => b.id === v.background?.preset)) {
    next.background.preset = v.background!.preset as string;
    next.background.image = null; // picking a preset replaces the uploaded image
  }
  if (typeof v.shadow === "string" && v.shadow in SHADOWS) next.shadow = v.shadow as Visuals["shadow"];
  const radius = num(v.radius);
  if (radius !== null) next.radius = Math.round(Math.max(0, Math.min(RADIUS_MAX, radius)));
  const padding = num(v.padding);
  if (padding !== null) next.padding = Math.round(Math.max(0, Math.min(PADDING_MAX, padding)));
  p.visuals = next;
}

/** Validates zooms: source-time ranges inside the video, focus 0–1, scale within limits. */
function applyZooms(p: Project, z: { enabled?: unknown; items?: unknown }) {
  const d = p.video.duration;
  const cur = { enabled: p.zooms?.enabled ?? true, items: p.zooms?.items ?? [] };
  if (typeof z.enabled === "boolean") cur.enabled = z.enabled;
  if (Array.isArray(z.items)) {
    const unit = (v: unknown) => Math.max(0, Math.min(1, num(v) ?? 0.5));
    cur.items = z.items
      .map((raw): Zoom | null => {
        const start = num(raw?.start);
        const end = num(raw?.end);
        if (typeof raw?.id !== "string" || start === null || end === null) return null;
        const zoom: Zoom = {
          id: raw.id,
          start: Math.max(0, Math.min(d, start)),
          end: Math.max(0, Math.min(d, end)),
          x: unit(raw.x),
          y: unit(raw.y),
          scale: Math.max(ZOOM_LIMITS.minScale, Math.min(ZOOM_LIMITS.maxScale, num(raw.scale) ?? ZOOM_LIMITS.defaultScale)),
          enabled: raw.enabled !== false,
        };
        return zoom.end > zoom.start ? zoom : null;
      })
      .filter((x): x is Zoom => x !== null)
      .sort((a, b) => a.start - b.start);
  }
  p.zooms = cur;
}
