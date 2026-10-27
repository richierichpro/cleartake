"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, CheckCircle2, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isSegmentRemoved } from "@/lib/edits";
import { clipStatus, voiceOf } from "@/lib/voice-settings";
import { isFramed, visualsOf } from "@/lib/visuals";
import type { ExportState, Project } from "@/lib/types";
import {
  compositionSize,
  DEFAULT_QUALITY,
  estimateRenderSeconds,
  EXPORT_QUALITIES,
  type ExportQuality,
} from "@/remotion/constants";

const downloadUrl = (id: string) => `/api/projects/${id}/export/download`;

export function ExportButton({ project, duration }: { project: Project; duration: number }) {
  const [state, setState] = useState<ExportState | null>(project.export ?? null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  // Defaults to the quality of the last export.
  const [quality, setQuality] = useState<ExportQuality>(project.export?.quality ?? DEFAULT_QUALITY);
  const rendering = state?.status === "rendering";
  const wasRendering = useRef(false);

  // Check on load (an export may have finished or failed while you were away), then poll while
  // rendering. The render keeps going even if you leave the editor.
  useEffect(() => {
    let stop = false;
    const fetchState = () =>
      fetch(`/api/projects/${project.id}/export`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : undefined))
        .then((s: ExportState | null | undefined) => !stop && s !== undefined && setState(s))
        .catch(() => {});
    fetchState();
    const t = rendering ? setInterval(fetchState, 1000) : undefined;
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [project.id, rendering]);

  // Tell the user when a render they were waiting on finishes.
  useEffect(() => {
    if (rendering) wasRendering.current = true;
    else if (wasRendering.current && state) {
      wasRendering.current = false;
      if (state.status === "done") {
        toast.success("Your video is ready", {
          action: { label: "Download", onClick: () => (window.location.href = downloadUrl(project.id)) },
        });
      } else if (state.status === "error") toast.error("Export failed", { description: state.error });
    }
  }, [rendering, state, project.id]);

  async function start() {
    setStarting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState(body);
    } catch (err) {
      toast.error("Couldn't start the export", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setStarting(false);
    }
  }

  const v = voiceOf(project);
  const silent =
    v.mode === "ai" ? (project.segments ?? []).filter(
          (s) => ["none", "outdated"].includes(clipStatus(s, v)) && !isSegmentRemoved(project, s),
        ).length : 0;
  const pct = Math.round((state?.progress ?? 0) * 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="lg" className="relative min-w-28 gap-2 overflow-hidden rounded-lg px-4">
            {rendering && (
              <motion.span
                className="absolute inset-y-0 left-0 bg-white/15"
                animate={{ width: `${pct}%` }}
                transition={{ ease: "easeOut", duration: 0.4 }}
              />
            )}
            {rendering ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
            <span className="relative tabular-nums">{rendering ? `Exporting ${pct}%` : "Export"}</span>
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Export video</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            MP4 · H.264 · {formatTime(duration)}
          </p>
        </div>

        <div className="p-4">
          {silent > 0 && !rendering && (
            <p className="mb-3 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-snug text-amber-800">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {silent} paragraph{silent > 1 ? "s have" : " has"} no up-to-date AI voice and will be silent. Generate them in the
              Script tab first.
            </p>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {rendering ? (
              <motion.div key="rendering" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex justify-between text-xs">
                  <span className="truncate text-muted-foreground">{state.stage}</span>
                  <span className="font-medium tabular-nums">{pct}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-foreground"
                    animate={{ width: `${Math.max(3, pct)}%` }}
                    transition={{ ease: "easeOut", duration: 0.4 }}
                  />
                </div>
                <p className="mt-3 text-xs leading-snug text-muted-foreground">
                  You can keep editing. Changes you make now will be in the next export, not this one.
                </p>
              </motion.div>
            ) : state?.status === "done" ? (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="font-medium">Ready</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {state.width ? `${state.width}×${state.height} · ` : ""}
                    {formatTime(state.duration ?? 0)} · {((state.size ?? 0) / 1e6).toFixed(1)} MB
                  </span>
                </div>
                <a href={downloadUrl(project.id)} className={buttonVariants({ size: "lg", className: "mt-3 w-full gap-2" })}>
                  <ArrowDownToLine /> Download
                </a>
                <div className="mt-4 border-t pt-3">
                  <QualityPicker project={project} duration={duration} value={quality} onChange={setQuality} />
                  <Button variant="outline" size="sm" className="mt-2.5 w-full gap-1.5" onClick={start} disabled={starting}>
                    <RotateCw /> Export again with latest edits
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {state?.status === "error" && (
                  <p className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-xs leading-snug text-destructive">
                    {state.error ?? "The last export failed."}
                  </p>
                )}
                <QualityPicker project={project} duration={duration} value={quality} onChange={setQuality} />
                <Button size="lg" className="mt-3 w-full gap-2" onClick={start} disabled={starting}>
                  {starting ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
                  {state?.status === "error" ? "Try again" : "Export video"}
                </Button>
                <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
                  Renders exactly what the preview shows. Rendering uses all CPU cores, so your fan may spin up.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QualityPicker({
  project,
  duration,
  value,
  onChange,
}: {
  project: Project;
  duration: number;
  value: ExportQuality;
  onChange: (q: ExportQuality) => void;
}) {
  const framed = isFramed(visualsOf(project));
  return (
    <div role="radiogroup" aria-label="Export quality" className="space-y-1">
      {EXPORT_QUALITIES.filter((q, i) => {
        // Hide options that give the same size as a smaller one (we never upscale).
        const size = compositionSize(project.video.width, project.video.height, q.id, framed);
        const prev = i > 0 && compositionSize(project.video.width, project.video.height, EXPORT_QUALITIES[i - 1].id, framed);
        return !prev || prev.height !== size.height;
      }).map((q) => {
        const size = compositionSize(project.video.width, project.video.height, q.id, framed);
        const minutes = estimateRenderSeconds(duration, size) / 60;
        const selected = q.id === value;
        return (
          <button
            key={q.id}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(q.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150",
              selected ? "border-foreground bg-[#FAFAFB]" : "hover:bg-[#FAFAFB]",
            )}
          >
            <span
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-foreground" : "border-muted-foreground/40",
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-foreground" />}
            </span>
            <span className="text-[13px] font-medium">{q.label}</span>
            <span className="text-xs text-muted-foreground">{q.hint}</span>
            <span className="ml-auto text-right text-[11px] leading-tight text-muted-foreground tabular-nums">
              {size.width}×{size.height}
              <br />≈ {minutes < 1 ? "<1" : Math.round(minutes)} min
            </span>
          </button>
        );
      })}
    </div>
  );
}
