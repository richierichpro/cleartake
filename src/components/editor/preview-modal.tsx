"use client";

import { useEffect } from "react";
import { Player } from "@remotion/player";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { CaptionLine } from "@/lib/captions";
import type { Overlays } from "@/lib/overlays";
import type { SyncPlan } from "@/lib/sync";
import type { Project } from "@/lib/types";
import type { OutputZoom } from "@/lib/zooms";
import { DemoVideo, FPS } from "@/remotion/demo-video";
import { useVideoProps } from "./use-video-props";

// Full-screen preview: the finished video from the start (intro, voice, zooms, captions, badges, outro),
// exactly as it exports, without the editor's overlays. Esc or a click outside closes it.
export function PreviewModal({
  project,
  plan,
  zooms,
  captions,
  overlays,
  onClose,
}: {
  project: Project;
  plan: SyncPlan;
  zooms: OutputZoom[];
  captions: CaptionLine[];
  overlays: Overlays;
  onClose: () => void;
}) {
  const { inputProps, durationInFrames, size } = useVideoProps(project, plan, zooms, captions, overlays);
  const aspect = size.width / size.height;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0B0B0D]/90 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-[92vw] items-center justify-between text-sm text-white/70" style={{ width: `min(92vw, calc(82vh * ${aspect}))` }}>
        <span>
          <span className="font-medium text-white">Preview</span> · exactly what your export will look like
        </span>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/10 hover:text-white"
        >
          <kbd className="rounded border border-white/20 px-1 font-sans text-[10px]">Esc</kbd>
          <X className="size-4" />
        </button>
      </div>
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="overflow-hidden rounded-xl bg-black shadow-[0_30px_90px_-20px_rgba(0,0,0,0.6)]"
        style={{ width: `min(92vw, calc(82vh * ${aspect}))`, aspectRatio: `${size.width} / ${size.height}` }}
      >
        <Player
          component={DemoVideo}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
          controls
          autoPlay
          clickToPlay
          allowFullscreen
          showVolumeControls
          moveToBeginningWhenEnded={false}
          acknowledgeRemotionLicense
          style={{ width: "100%", height: "100%" }}
        />
      </motion.div>
    </motion.div>
  );
}
