"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, FileText, Loader2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rewriteScript } from "@/lib/client";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import type { Playback } from "./use-playback";

// Script tab: reads like a document. Timestamp gutter on the left, paragraphs on the right.
export function ScriptView({
  project,
  playback,
  onChange,
}: {
  project: Project;
  playback: Playback;
  onChange: (p: Project) => void;
}) {
  const { segments } = project;
  const t = playback.currentTime;
  const [polishing, setPolishing] = useState(false);

  async function polish() {
    setPolishing(true);
    try {
      const updated = await rewriteScript(project.id);
      onChange(updated);
      const retakes = updated.segments?.filter((s) => s.isRetake).length ?? 0;
      toast.success("Script polished", {
        description: retakes ? `${retakes} retake${retakes > 1 ? "s" : ""} found and muted.` : undefined,
      });
    } catch (err) {
      toast.error("Couldn't polish the script", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setPolishing(false);
    }
  }

  if (!segments) {
    if (project.status === "ready") return <ScriptSkeleton />; // being built from the transcript
    return (
      <Empty
        title="No script yet"
        hint="Transcribe your voiceover to start editing the script."
        action={
          <Link href={`/projects/${project.id}/processing`} className={buttonVariants({ className: "mt-5 gap-2 px-4" })}>
            <AudioLines /> Transcribe recording
          </Link>
        }
      />
    );
  }

  if (segments.length === 0) {
    return (
      <Empty
        title="No speech found"
        hint="We couldn't hear any narration in this recording. Check that your microphone was on when you recorded, then upload it again."
      />
    );
  }

  return (
    <div className="px-4 py-5">
      <AnimatePresence initial={false}>
        {!project.rewrite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mx-2 mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/[0.04] p-3 pl-4">
              <Sparkles className="size-4 shrink-0 text-brand" />
              <p className="flex-1 text-[13px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">Polish your script.</span> Fix grammar, remove fillers and
                retakes. Your original words are kept.
              </p>
              <button
                onClick={polish}
                disabled={polishing}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand/90 disabled:opacity-70"
              >
                {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {polishing ? "Polishing…" : "Polish with AI"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {segments.map((s) => {
        const active = t >= s.start && t < s.end;
        return (
          <div
            key={s.id}
            className={cn(
              "group flex gap-4 rounded-xl px-2 py-3 transition-colors duration-150",
              active ? "bg-[#FAFAFB]" : "hover:bg-[#FAFAFB]",
            )}
          >
            <button
              onClick={() => playback.playRange(s.start, s.end)}
              aria-label={`Play paragraph at ${formatTime(s.start)}`}
              className={cn(
                "relative mt-[3px] h-5 w-11 shrink-0 rounded-md text-left font-mono text-[11px] tabular-nums transition-colors",
                active ? "text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="transition-opacity group-hover:opacity-0">{formatTime(s.start)}</span>
              <span className="absolute inset-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="size-3 fill-current" /> Play
              </span>
            </button>
            {s.isRetake ? (
              <div className="min-w-0">
                <span className="mb-1 inline-flex items-center rounded-md border border-dashed px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Retake · no narration
                </span>
                <p className="text-[14.5px] leading-7 text-muted-foreground/70 line-through decoration-muted-foreground/40">
                  {s.originalText}
                </p>
              </div>
            ) : (
              <p
                className={cn(
                  "text-[14.5px] leading-7 transition-opacity",
                  s.text ? "text-foreground" : "text-muted-foreground/60",
                  polishing && "animate-pulse opacity-50",
                )}
              >
                {s.text || "Enter script text..."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScriptSkeleton() {
  return (
    <div className="space-y-6 px-6 py-7">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-[#FAFAFB]">
        <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 max-w-64 text-sm leading-relaxed text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}
