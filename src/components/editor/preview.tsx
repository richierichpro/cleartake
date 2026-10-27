"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Playback } from "./use-playback";

const PADDING = 48;

export function Preview({ src, aspect, playback }: { src: string; aspect: number; playback: Playback }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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

  return (
    <div ref={containerRef} className="dot-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      {size && (
        <div
          style={{ width: size.w, height: size.h }}
          className="group relative overflow-hidden rounded-xl bg-black shadow-[0_24px_60px_-20px_rgba(17,17,19,0.35),0_0_0_1px_rgba(17,17,19,0.06)]"
        >
          <video
            {...playback.videoProps}
            src={src}
            preload="auto"
            playsInline
            onClick={playback.toggle}
            onLoadedData={() => setStatus("ready")}
            onError={() => setStatus("error")}
            className="size-full cursor-pointer object-contain"
          />

          {status === "loading" && <Skeleton className="absolute inset-0 rounded-none bg-[#EDEDF0]" />}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#F5F5F6] px-8 text-center">
              <TriangleAlert className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">This video can&apos;t be played in the browser</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                The codec isn&apos;t supported (often HEVC .mov files). Re-export the recording as MP4 (H.264) and upload it again.
              </p>
            </div>
          )}

          <AnimatePresence>
            {status === "ready" && !playback.playing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <button
                  onClick={playback.toggle}
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
