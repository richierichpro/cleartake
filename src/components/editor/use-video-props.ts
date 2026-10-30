"use client";

import { useMemo } from "react";
import type { CaptionLine } from "@/lib/captions";
import { mediaUrl } from "@/lib/client";
import { drawnOverlays, sceneLengths, type Overlays } from "@/lib/overlays";
import type { SyncPlan } from "@/lib/sync";
import type { Project } from "@/lib/types";
import { frameProps } from "@/lib/visuals";
import { voiceOf } from "@/lib/voice-settings";
import { musicOf } from "@/lib/music";
import type { OutputZoom } from "@/lib/zooms";
import { compositionSize, FPS, type DemoVideoProps } from "@/remotion/demo-video";

/** The composition's props, length and size: the same for the editor preview, full-screen preview and export. */
export function useVideoProps(project: Project, plan: SyncPlan, zooms: OutputZoom[], captions: CaptionLine[], overlays: Overlays) {
  const frame = frameProps(project, (file) => mediaUrl(project.id, file));
  // Stable keys, so the Player only re-renders when something it draws changes.
  const frameKey = JSON.stringify(frame);
  const zoomsKey = JSON.stringify(zooms);
  const captionsKey = JSON.stringify(captions);
  const overlaysKey = JSON.stringify(drawnOverlays(overlays));
  const mode = voiceOf(project).mode;
  const musicKey = JSON.stringify(musicOf(project, (file) => mediaUrl(project.id, file)));
  const { lead, tail } = sceneLengths(overlays);
  const durationInFrames = Math.max(1, Math.round((lead + plan.outputDuration + tail) * FPS));
  const size = compositionSize(project.video.width, project.video.height, "1080p", frame.framed);

  const inputProps: DemoVideoProps = useMemo(
    () => ({
      videoSrc: mediaUrl(project.id, project.video.file),
      pieces: plan.pieces,
      voice: plan.voice.map((x) => ({ src: mediaUrl(project.id, x.file), outputStart: x.outputStart, duration: x.duration })),
      muteOriginal: mode === "ai",
      frame: JSON.parse(frameKey),
      zooms: JSON.parse(zoomsKey),
      captions: JSON.parse(captionsKey),
      overlays: JSON.parse(overlaysKey),
      duration: plan.outputDuration,
      music: JSON.parse(musicKey),
    }),
    [project.id, project.video.file, plan, mode, frameKey, zoomsKey, captionsKey, overlaysKey, musicKey],
  );
  return { inputProps, durationInFrames, size };
}
