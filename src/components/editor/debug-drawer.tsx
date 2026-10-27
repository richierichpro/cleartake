"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bug, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rebuildSegments, rewriteScript } from "@/lib/client";
import { formatRelative, formatTime } from "@/lib/format";
import { SEGMENT_CONFIG } from "@/lib/segments";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import type { Playback } from "./use-playback";

// Debug views for automatic decisions, kept out of the main UI.
// Covers only the preview so the control bar and timeline (212px) stay usable.
export function DebugDrawer({
  project,
  playback,
  onChange,
  onClose,
}: {
  project: Project;
  playback: Playback;
  onChange: (p: Project) => void;
  onClose: () => void;
}) {
  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0.6 }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
      className="absolute top-0 right-0 bottom-[212px] z-30 flex w-[440px] max-w-full flex-col border-l bg-white shadow-[-12px_0_40px_-20px_rgba(17,17,19,0.25)]"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <Bug className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Debug</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Close debug">
          <X />
        </Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <SegmentsDebug project={project} playback={playback} onChange={onChange} />
        <div className="mx-4 border-t" />
        <RewriteDebug project={project} onChange={onChange} />
      </div>
    </motion.aside>
  );
}

function SegmentsDebug({
  project,
  playback,
  onChange,
}: {
  project: Project;
  playback: Playback;
  onChange: (p: Project) => void;
}) {
  const [busy, setBusy] = useState(false);
  const segments = project.segments ?? [];
  const c = SEGMENT_CONFIG;
  const speech = segments.map((s) => s.speechEnd - s.speechStart);
  const avg = speech.length ? speech.reduce((a, b) => a + b, 0) / speech.length : 0;

  async function rebuild() {
    setBusy(true);
    try {
      onChange(await rebuildSegments(project.id));
      toast.success("Segments rebuilt");
    } catch (err) {
      toast.error("Couldn't rebuild segments", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Segments</h3>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={rebuild} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RotateCw />} Rebuild
        </Button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {[`min ${c.minDuration}s`, `soft max ${c.softMax}s`, `max ${c.maxDuration}s`, `pause ≥ ${c.pauseBreak}s`, `lead-in ${c.leadIn}s`].map(
          (label) => (
            <span key={label} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {label}
            </span>
          ),
        )}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {segments.length} paragraphs · avg {avg.toFixed(1)}s of speech. Lengths outside {c.minDuration}–{c.maxDuration}s are
        flagged.
      </p>

      {segments.length > 0 && (
        <table className="mt-3 w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b text-left text-[11px] text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">#</th>
              <th className="py-1.5 pr-2 font-medium">Video range</th>
              <th className="py-1.5 pr-2 font-medium">Speech</th>
              <th className="py-1.5 pr-2 font-medium">Words</th>
              <th className="py-1.5 font-medium">Ended by</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s, i) => {
              const len = speech[i];
              const flagged = s.breakReason !== "end" && (len < c.minDuration || len > c.maxDuration);
              const active = playback.currentTime >= s.start && playback.currentTime < s.end;
              return (
                <tr
                  key={s.id}
                  onClick={() => playback.seek(s.start)}
                  className={cn("cursor-pointer border-b border-border/60 transition-colors hover:bg-[#FAFAFB]", active && "bg-brand/[0.05]")}
                >
                  <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">
                    {formatTime(s.start)}–{formatTime(s.end)}
                  </td>
                  <td className={cn("py-1.5 pr-2", flagged && "font-medium text-amber-600")}>{len.toFixed(1)}s</td>
                  <td className="py-1.5 pr-2">{s.wordEnd - s.wordStart}</td>
                  <td className="py-1.5 text-muted-foreground">
                    {s.breakReason === "pause" ? `pause ${s.pauseAfter.toFixed(1)}s` : s.breakReason === "length" ? "length" : "end of speech"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function RewriteDebug({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const [busy, setBusy] = useState(false);
  const segments = project.segments ?? [];
  const r = project.rewrite;

  async function run() {
    setBusy(true);
    try {
      onChange(await rewriteScript(project.id));
      toast.success("Script rewritten");
    } catch (err) {
      toast.error("Rewrite failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Script rewrite</h3>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={run} disabled={busy || !segments.length}>
          {busy ? <Loader2 className="animate-spin" /> : <RotateCw />} {r ? "Run again" : "Run"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {r ? (
          <>
            <span className="font-mono text-[11px]">{r.model}</span> · {formatRelative(r.at)}.
            {r.missing > 0 && <span className="text-amber-600"> {r.missing} paragraph(s) skipped by the model.</span>}
          </>
        ) : (
          "Not rewritten yet."
        )}{" "}
        Length changes beyond ±35% are flagged: they may not fit the video.
      </p>

      {r &&
        segments.map((s, i) => {
          const before = wordCount(s.originalText);
          const after = wordCount(s.aiText ?? s.text);
          const change = before ? Math.round(((after - before) / before) * 100) : 0;
          const flagged = !s.isRetake && Math.abs(change) > 35;
          return (
            <div key={s.id} className="mt-3 rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px]">
                <span className="font-medium">#{i + 1}</span>
                <span className="font-mono text-muted-foreground">{formatTime(s.start)}</span>
                {s.isRetake && (
                  <span className="rounded border border-dashed px-1.5 py-px font-medium text-muted-foreground">retake</span>
                )}
                <span className={cn("ml-auto tabular-nums", flagged ? "font-medium text-amber-600" : "text-muted-foreground")}>
                  {before} → {after} words{!s.isRetake && ` (${change > 0 ? "+" : ""}${change}%)`}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.originalText}</p>
              <p className="mt-1.5 border-l-2 border-brand/50 pl-2 text-xs leading-relaxed">
                {s.isRetake ? <em className="text-muted-foreground">No narration</em> : s.aiText}
              </p>
            </div>
          );
        })}
    </section>
  );
}
