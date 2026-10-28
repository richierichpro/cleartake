"use client";

import type { Project, Transcript, Visuals, VoiceSettings, Zoom } from "./types";
import type { Motion } from "./sync";
import type { ZoomSuggestions } from "./zoom-suggest";
import type { VoiceOption } from "./elevenlabs";
import type { DirectorContent } from "./director";

export const mediaUrl = (id: string, file: string) => `/api/projects/${id}/media/${file}`;

export interface LocalVideoInfo {
  duration: number;
  width: number;
  height: number;
  thumbnail: Blob | null;
}

/** Reads duration/size and grabs a thumbnail frame in the browser before uploading. */
export async function readVideoInfo(file: File): Promise<LocalVideoInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;

  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(event, () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("unreadable")), { once: true });
    });

  try {
    await once("loadedmetadata");
    let duration = video.duration;
    // Browser-recorded WebM files report Infinity until you seek to the end.
    if (!Number.isFinite(duration)) {
      video.currentTime = 1e9;
      await once("seeked");
      duration = video.duration;
    }
    const info = { duration: Number.isFinite(duration) ? duration : 0, width: video.videoWidth, height: video.videoHeight };

    video.currentTime = Math.min(1, info.duration * 0.1);
    await once("seeked");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.round((640 * info.height) / Math.max(1, info.width));
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return { ...info, thumbnail };
  } catch {
    // The browser can't decode this codec; upload anyway with defaults.
    return { duration: 0, width: 1920, height: 1080, thumbnail: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Streams the file to the server with upload progress (fetch can't report upload progress). */
export function uploadVideo(
  file: File,
  info: LocalVideoInfo,
  onProgress: (fraction: number) => void,
): Promise<Project> {
  const params = new URLSearchParams({
    name: file.name,
    duration: String(info.duration),
    width: String(info.width),
    height: String(info.height),
  });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects?${params}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Project);
      else reject(new Error(body.error ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

export async function uploadThumbnail(id: string, blob: Blob) {
  await fetch(`/api/projects/${id}/thumbnail`, { method: "POST", body: blob });
}

export async function updateProject(
  id: string,
  patch: {
    title?: string;
    voice?: Partial<Pick<VoiceSettings, "mode" | "voiceId" | "voiceName">>;
    edit?: { cuts?: Project["cuts"]; trim?: Project["trim"] | null; splits?: number[] };
    zooms?: { enabled?: boolean; items?: Zoom[] };
    captions?: { enabled: boolean };
    director?: DirectorContent;
    scenes?: { intro?: boolean; outro?: boolean };
    visuals?: {
      background?: { enabled?: boolean; preset?: string };
      shadow?: Visuals["shadow"];
      radius?: number;
      padding?: number;
    };
  },
) {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Could not save");
  return (await res.json()) as Project;
}

export async function startProcessing(id: string, keyterms: string[]) {
  const res = await fetch(`/api/projects/${id}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyterms }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Could not start processing");
  return body as Project;
}

export async function rebuildSegments(id: string) {
  const res = await fetch(`/api/projects/${id}/segments`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Could not build segments");
  return body as Project;
}

export async function rewriteScript(id: string) {
  const res = await fetch(`/api/projects/${id}/rewrite`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Rewrite failed");
  return body as Project;
}

export async function deleteProject(id: string) {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not delete project");
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const updateSegment = (id: string, segmentId: string, patch: { text?: string; deleted?: boolean }) =>
  fetch(`/api/projects/${id}/segments/${segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => json<Project>(r));

export const splitSegment = (id: string, at: number) =>
  fetch(`/api/projects/${id}/segments/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at }),
  }).then((r) => json<{ project: Project; id: string }>(r));

export const runDirector = (id: string) =>
  fetch(`/api/projects/${id}/director`, { method: "POST" }).then((r) => json<Project>(r));

export const generateVoice = (id: string, segmentId: string) =>
  fetch(`/api/projects/${id}/voice/${segmentId}`, { method: "POST" }).then((r) => json<Project>(r));

export const fetchVoices = () =>
  fetch("/api/voices").then((r) =>
    json<{ voices: VoiceOption[]; credits: { used: number; limit: number } | null }>(r),
  );

/** Motion scores + transcript words for the sync plan; null when not analyzed/transcribed yet. */
export async function fetchPlanInputs(id: string) {
  const get = <T>(file: string) =>
    fetch(mediaUrl(id, file), { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<T>) : null));
  const [motion, transcript] = await Promise.all([get<Motion>("motion.json"), get<Transcript>("transcript.json")]);
  return { motion, words: transcript?.words ?? [] };
}

export const analyzeActivity = (id: string) =>
  fetch(`/api/projects/${id}/activity`, { method: "POST" }).then((r) => json<Motion>(r));

export const uploadBackground = (id: string, file: File) =>
  fetch(`/api/projects/${id}/background`, { method: "POST", headers: { "Content-Type": file.type }, body: file }).then((r) =>
    json<Project>(r),
  );

export const removeBackground = (id: string) =>
  fetch(`/api/projects/${id}/background`, { method: "DELETE" }).then((r) => json<Project>(r));

/** Cached zoom suggestions, or a fresh run when there are none yet. */
export async function fetchZoomCandidates(id: string, rerun = false): Promise<ZoomSuggestions> {
  if (!rerun) {
    const cached = await fetch(mediaUrl(id, "zoom-suggestions.json"), { cache: "no-store" });
    if (cached.ok) return cached.json();
  }
  return fetch(`/api/projects/${id}/zoom-candidates`, { method: "POST" }).then((r) => json<ZoomSuggestions>(r));
}
