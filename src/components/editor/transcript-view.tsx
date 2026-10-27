"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AudioLines, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project, Transcript, TranscriptWord } from "@/lib/types";
import type { Playback } from "./use-playback";

// Raw transcript, one sentence per line. Step 3 replaces this with segments.
function toSentences(words: TranscriptWord[]) {
  const sentences: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (const w of words) {
    current.push(w);
    if (/[.?!]$/.test(w.text)) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length) sentences.push(current);
  return sentences;
}

export function TranscriptView({
  project,
  transcript,
  playback,
}: {
  project: Project;
  transcript: Transcript | null | undefined;
  playback: Playback;
}) {
  const sentences = useMemo(() => toSentences(transcript?.words ?? []), [transcript]);
  const t = playback.currentTime;

  if (transcript === undefined) return null; // still loading

  if (!transcript) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-[#FAFAFB]">
          <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium">No transcript yet</p>
        <p className="mt-1.5 max-w-64 text-sm leading-relaxed text-muted-foreground">
          Transcribe your voiceover to start editing the script.
        </p>
        <Link href={`/projects/${project.id}/processing`} className={buttonVariants({ className: "mt-5 gap-2 px-4" })}>
          <AudioLines /> Transcribe recording
        </Link>
      </div>
    );
  }

  if (sentences.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
        <p className="text-sm font-medium">No speech found</p>
        <p className="mt-1.5 max-w-64 text-sm text-muted-foreground">
          We couldn&apos;t hear any narration in this recording.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-4">
      <div className="mb-3 flex items-center justify-between px-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Raw transcript</p>
        <p className="text-xs text-muted-foreground">{transcript.words.length} words</p>
      </div>
      {sentences.map((s, i) => {
        const start = s[0].start;
        const end = s[s.length - 1].end;
        const active = t >= start && t < (sentences[i + 1]?.[0].start ?? end + 1);
        return (
          <div
            key={i}
            className={cn(
              "group flex gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150",
              active ? "bg-[#FAFAFB]" : "hover:bg-[#FAFAFB]",
            )}
          >
            <button
              onClick={() => playback.seek(start)}
              className={cn(
                "mt-[3px] h-fit shrink-0 rounded px-1 font-mono text-[11px] tabular-nums transition-colors",
                active ? "text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {formatTime(start)}
            </button>
            <p className="text-[14px] leading-relaxed">
              {s.map((w, j) => (
                <span
                  key={j}
                  className={cn(
                    "rounded-sm transition-colors",
                    t >= w.start && t < w.end && "bg-brand/15",
                    w.confidence < 0.5 && "underline decoration-amber-400 decoration-dotted underline-offset-4",
                  )}
                >
                  {w.text}{" "}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
