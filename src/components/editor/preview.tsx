"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sparkles, TriangleAlert } from "lucide-react";
import { mediaUrl } from "@/lib/client";
import { clipStatus, voiceOf } from "@/lib/voice-settings";
import type { SyncPlan } from "@/lib/sync";
import type { Project } from "@/lib/types";
import { compositionSize, DemoVideo, FPS, type DemoVideoProps } from "@/remotion/demo-video";
import type { Playback } from "./use-playback";

const PADDING = 48;

export function Preview({ project, plan, playback }: { project: Project; plan: SyncPlan; playback: Playback }) {
  const { attachPlayer, playing, toggle } = playback;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const comp = compositionSize(project.video.width, project.video.height);
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
    }),
    [project.id, project.video.file, plan, v.mode],
  );

  // Paragraphs that will play silently because their AI voice is missing or outdated.
  const missingVoice =
    v.mode === "ai" ? (project.segments ?? []).filter((s) => ["none", "outdated"].includes(clipStatus(s, v))).length : 0;
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

          <AnimatePresence>
            {!playing && (
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
