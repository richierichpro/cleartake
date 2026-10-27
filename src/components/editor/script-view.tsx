"use client";

import Link from "next/link";
import { AudioLines, FileText, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import type { Playback } from "./use-playback";

// Script tab: reads like a document. Timestamp gutter on the left, paragraphs on the right.
export function ScriptView({ project, playback }: { project: Project; playback: Playback }) {
  const { segments } = project;
  const t = playback.currentTime;

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
    <div className="px-4 py-6">
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
            <p className="text-[14.5px] leading-7 text-foreground">{s.text}</p>
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
