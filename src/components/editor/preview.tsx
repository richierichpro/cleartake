"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sparkles, TriangleAlert } from "lucide-react";
import { mediaUrl } from "@/lib/client";
import { cn } from "@/lib/utils";
import { isSegmentRemoved } from "@/lib/edits";
import { clipStatus, voiceOf } from "@/lib/voice-settings";
import { frameProps, recordingBox } from "@/lib/visuals";
import type { CaptionLine } from "@/lib/captions";
import type { ZoomCandidate } from "@/lib/zoom-detect";
import { zoomWindow, type OutputZoom } from "@/lib/zooms";
import type { Zoom } from "@/lib/types";
import type { SyncPlan } from "@/lib/sync";
import type { Project } from "@/lib/types";
import { compositionSize, DemoVideo, FPS, type DemoVideoProps } from "@/remotion/demo-video";
import type { Playback } from "./use-playback";

const PADDING = 48;

export function Preview({
  project,
  plan,
  playback,
  debugBoxes = [],
  zooms,
  captions,
  aim,
}: {
  project: Project;
  plan: SyncPlan;
  playback: Playback;
  debugBoxes?: ZoomCandidate[]; // Step 12: detected change regions to outline (debug only)
  zooms: OutputZoom[]; // Step 13: what the Player plays (output seconds)
  captions: CaptionLine[]; // Step 14: empty when captions are off
  aim?: { zoom: Zoom; onFocus: (x: number, y: number) => void } | null; // a selected zoom: click to set its focus
}) {
  const { attachPlayer, playing, toggle } = playback;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const frame = frameProps(project, (file) => mediaUrl(project.id, file));
  const frameKey = JSON.stringify(frame); // stable key so the Player only re-renders when the frame changes
  const zoomsKey = JSON.stringify(zooms);
  const captionsKey = JSON.stringify(captions);
  const comp = compositionSize(project.video.width, project.video.height, "1080p", frame.framed);
  const aspect = comp.width / comp.height;

  // Fit the frame inside the canvas while keeping the video's aspect ratio.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const W = entry.contentRect.width - PADDING * 2;
      const H = entry.contentRect.height - PADDING * 2;
      const w = Math.max(0, Math.min(W, H * aspect));
      setSize({ w, h: w / aspect });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const v = voiceOf(project);
  const inputProps: DemoVideoProps = useMemo(
    () => ({
      videoSrc: mediaUrl(project.id, project.video.file),
      pieces: plan.pieces,
      voice: plan.voice.map((x) => ({ src: mediaUrl(project.id, x.file), outputStart: x.outputStart, duration: x.duration })),
      muteOriginal: v.mode === "ai",
      frame: JSON.parse(frameKey),
      zooms: JSON.parse(zoomsKey),
      captions: JSON.parse(captionsKey),
    }),
    [project.id, project.video.file, plan, v.mode, frameKey, zoomsKey, captionsKey],
  );

  // Paragraphs that will play silently because their AI voice is missing or outdated.
  const missingVoice =
    v.mode === "ai" ? (project.segments ?? []).filter(
          (s) => ["none", "outdated"].includes(clipStatus(s, v)) && !isSegmentRemoved(project, s),
        ).length : 0;
  const durationInFrames = Math.max(1, Math.round(plan.outputDuration * FPS));

  return (
    <div ref={containerRef} className="dot-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      <AnimatePresence>
        {missingVoice > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-white/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
          >
            <Sparkles className="size-3.5 text-brand" />
            {missingVoice} paragraph{missingVoice > 1 ? "s" : ""} will play silently until you generate {missingVoice > 1 ? "their" : "its"} AI
            voice
          </motion.div>
        )}
      </AnimatePresence>

      {size && (
        <div
          style={{ width: size.w, height: size.h }}
          className="group relative overflow-hidden rounded-xl bg-black shadow-[0_24px_60px_-20px_rgba(17,17,19,0.35),0_0_0_1px_rgba(17,17,19,0.06)]"
        >
          <Player
            ref={attachPlayer}
            component={DemoVideo}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={FPS}
            compositionWidth={comp.width}
            compositionHeight={comp.height}
            controls={false}
            clickToPlay
            spaceKeyToPlayOrPause={false}
            doubleClickToFullscreen={false}
            moveToBeginningWhenEnded={false}
            style={{ width: "100%", height: "100%" }}
            errorFallback={() => <PlaybackError />}
          />

          {/* Debug: detected change regions, drawn over the recording area */}
          {debugBoxes.length > 0 &&
            (() => {
              const rec = recordingBox(JSON.parse(frameKey), size.w, size.h);
              return debugBoxes.map((z) => (
                <div
                  key={z.id}
                  className="pointer-events-none absolute rounded-[4px] border-2 border-brand bg-brand/10"
                  style={{
                    left: rec.left + z.x * rec.width,
                    top: rec.top + z.y * rec.height,
                    width: z.w * rec.width,
                    height: z.h * rec.height,
                  }}
                >
                  <span
                    className={cn(
                      "absolute left-0 rounded bg-brand px-1 font-mono text-[10px] text-white",
                      z.y < 0.06 ? "top-0.5 left-0.5" : "-top-5", // keep the label visible at the top edge
                    )}
                  >
                    {z.start.toFixed(1)}s · {(z.w * z.h * 100).toFixed(z.w * z.h < 0.01 ? 1 : 0)}%
                  </span>
                </div>
              ));
            })()}

          {/* Aiming a selected zoom: full frame, dashed window of what the zoom shows, click to move the focus */}
          {aim &&
            (() => {
              const rec = recordingBox(JSON.parse(frameKey), size.w, size.h);
              const win = zoomWindow(aim.zoom.x, aim.zoom.y, aim.zoom.scale);
              return (
                <div
                  className="absolute z-10 cursor-crosshair"
                  style={{ left: rec.left, top: rec.top, width: rec.width, height: rec.height }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    aim.onFocus((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-black/25" />
                  <div
                    className="pointer-events-none absolute rounded-md border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] transition-all duration-150"
                    style={{
                      left: `${win.left * 100}%`,
                      top: `${win.top * 100}%`,
                      width: `${win.width * 100}%`,
                      height: `${win.height * 100}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow transition-all duration-150"
                    style={{ left: `${aim.zoom.x * 100}%`, top: `${aim.zoom.y * 100}%` }}
                  />
                  <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
                    Click to choose where this zoom points · {aim.zoom.scale.toFixed(1)}× · Press play to preview
                  </div>
                </div>
              );
            })()}

          <AnimatePresence>
            {!playing && !aim && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <button
                  onClick={toggle}
                  aria-label="Play"
                  className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg backdrop-blur transition-transform duration-150 hover:scale-105"
                >
                  <Play className="ml-0.5 size-5 fill-current" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function PlaybackError() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#F5F5F6] px-8 text-center">
      <TriangleAlert className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">This video can&apos;t be played in the browser</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The codec isn&apos;t supported (often HEVC .mov files). Re-export the recording as MP4 (H.264) and upload it again.
      </p>
    </div>
  );
}
