"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Player } from "@remotion/player";
import { motion } from "framer-motion";
import { ArrowLeft, Captions, Flag, Mic, PenLine, Scissors, ZoomIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCaptions, captionsOn } from "@/lib/captions";
import { formatTime } from "@/lib/format";
import { buildOverlays, sceneLengths } from "@/lib/overlays";
import { identityPlan } from "@/lib/sync";
import type { Project } from "@/lib/types";
import { voiceOf } from "@/lib/voice-settings";
import { outputZooms } from "@/lib/zooms";
import { DemoVideo, FPS } from "@/remotion/demo-video";
import { ExportButton } from "@/components/editor/export-button";
import { useSyncPlan } from "@/components/editor/use-sync-plan";
import { useVideoProps } from "@/components/editor/use-video-props";
import { LogoMark } from "@/components/logo";

export function ResultView({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | "missing">(null);
  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setProject)
      .catch(() => setProject("missing"));
  }, [id]);

  if (project === null) return <ResultSkeleton />;
  if (project === "missing") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-sm">
        <p className="font-medium">This project doesn&apos;t exist</p>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          All projects
        </Link>
      </div>
    );
  }
  return <Result project={project} />;
}

function Result({ project }: { project: Project }) {
  const sync = useSyncPlan(project);
  const plan = sync.plan;
  const ready = !!plan;
  const p = plan ?? identityPlan(project);
  const overlays = useMemo(() => buildOverlays(project, p, sync.words), [project, p, sync.words]);
  const ai = voiceOf(project).mode === "ai";
  const captions = useMemo(() => (captionsOn(project) && ai ? buildCaptions(project, p) : []), [project, p, ai]);
  const zooms = useMemo(() => outputZooms(project, p), [project, p]);
  const { inputProps, durationInFrames, size } = useVideoProps(project, p, zooms, captions, overlays);
  const { lead, tail } = sceneLengths(overlays);
  const total = lead + p.outputDuration + tail;
  const aspect = size.width / size.height;
  // Start once the title card is in, so the first frame is never an empty background
  // (and it reads well even if the browser blocks autoplay).
  const initialFrame = overlays.intro ? Math.round(0.6 * FPS) : 0;

  // What Cleartake did, in a few words.
  const chips = [
    ai && p.voice.length > 0 && { icon: Mic, text: `AI voice: ${voiceOf(project).voiceName}` },
    { icon: Scissors, text: `${formatTime(project.video.duration)} → ${formatTime(p.outputDuration)}` },
    zooms.length > 0 && { icon: ZoomIn, text: `${zooms.length} zoom${zooms.length > 1 ? "s" : ""}` },
    overlays.steps.length > 0 && { icon: Flag, text: `${overlays.steps.length} step label${overlays.steps.length > 1 ? "s" : ""}` },
    captions.length > 0 && { icon: Captions, text: "Captions" },
  ].filter(Boolean) as { icon: typeof Mic; text: string }[];

  return (
    <div className="flex min-h-dvh flex-col bg-[#F5F5F6]">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-white px-4">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="All projects" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <ArrowLeft />
          </Link>
          <LogoMark className="size-6" />
        </div>
        <p className="max-w-[40vw] truncate text-sm font-medium">{project.title}</p>
        <div className="flex items-center justify-end gap-2">
          <Link href={`/projects/${project.id}`} className={buttonVariants({ variant: "outline", className: "gap-1.5" })}>
            <PenLine /> Edit
          </Link>
          <ExportButton project={project} duration={total} />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-30px_rgba(17,17,19,0.45)]"
          style={{ width: `min(1100px, 90vw, calc((100dvh - 230px) * ${aspect}))`, aspectRatio: `${size.width} / ${size.height}` }}
        >
          {ready ? (
            <Player
              component={DemoVideo}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              fps={FPS}
              compositionWidth={size.width}
              compositionHeight={size.height}
              controls
              autoPlay
              initialFrame={initialFrame}
              clickToPlay
              allowFullscreen
              showVolumeControls
              moveToBeginningWhenEnded={false}
              acknowledgeRemotionLicense
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Skeleton className="size-full rounded-none" />
          )}
        </motion.div>

        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.2 } }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {chips.map((c) => (
              <span key={c.text} className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground">
                <c.icon className="size-3.5 text-brand" /> {c.text}
              </span>
            ))}
            <Link href={`/projects/${project.id}`} className="ml-1 text-xs font-medium underline-offset-4 hover:underline">
              Change anything in the editor →
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F5F5F6]">
      <div className="h-14 border-b bg-white" />
      <div className="flex flex-1 items-center justify-center px-6">
        <Skeleton className="aspect-video w-[min(1100px,90vw)] rounded-2xl" />
      </div>
    </div>
  );
}
