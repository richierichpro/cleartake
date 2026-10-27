"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bug, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rebuildSegments, rewriteScript } from "@/lib/client";
import { formatRelative, formatTime } from "@/lib/format";
import { SEGMENT_CONFIG } from "@/lib/segments";
import { outputToSource, sourceToOutput, SYNC_CONFIG, type CleanupAction, type SyncPlan } from "@/lib/sync";
import { ACTION_COLOR, STATE_COLOR } from "./timeline";
import type { useSyncPlan } from "./use-sync-plan";
import type { ZoomDetectionState } from "./use-zoom-detection";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import type { Playback } from "./use-playback";

// Debug views for automatic decisions, kept out of the main UI.
// Sits beside the preview (the preview shrinks), so the video, control bar and timeline stay usable.
export function DebugDrawer({
  project,
  playback,
  sync,
  plan,
  zoomDetection,
  onChange,
  onClose,
}: {
  project: Project;
  playback: Playback;
  sync: ReturnType<typeof useSyncPlan>;
  plan: SyncPlan; // for mapping source times to the edited video
  zoomDetection: ZoomDetectionState;
  onChange: (p: Project) => void;
  onClose: () => void;
}) {
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 500, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 42 }}
      className="flex shrink-0 flex-col overflow-hidden border-l bg-white"
    >
      <div className="flex h-full w-[500px] flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <Bug className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Debug</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Close debug">
          <X />
        </Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <SyncDebug sync={sync} playback={playback} />
        <div className="mx-4 border-t" />
        <ZoomDebug zoom={zoomDetection} plan={plan} playback={playback} />
        <div className="mx-4 border-t" />
        <SegmentsDebug project={project} plan={plan} playback={playback} onChange={onChange} />
        <div className="mx-4 border-t" />
        <RewriteDebug project={project} onChange={onChange} />
      </div>
      </div>
    </motion.aside>
  );
}

function SegmentsDebug({
  project,
  plan,
  playback,
  onChange,
}: {
  project: Project;
  plan: SyncPlan;
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
              const sourceNow = outputToSource(plan, playback.currentTime);
              const active = sourceNow >= s.start && sourceNow < s.end;
              return (
                <tr
                  key={s.id}
                  onClick={() => playback.seek(sourceToOutput(plan, s.start))}
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

const REASON: Record<CleanupAction["reason"], string> = {
  still: "silent, screen still",
  moving: "silent, screen moving",
  lead: "before first activity",
  tail: "after last activity",
  retake: "retake",
  deleted: "deleted paragraph",
};

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function SyncDebug({ sync, playback }: { sync: ReturnType<typeof useSyncPlan>; playback: Playback }) {
  const { plan, analyzing, analyze } = sync;
  const c = SYNC_CONFIG;
  const chips = [
    `${c.fps} fps`,
    `moving > ${c.movingThreshold}%`,
    `still > ${c.stillCutAfter}s → cut (keep ${c.stillKeep}s)`,
    `moving > ${c.movingFastAfter}s → ${c.fastSpeed}×`,
    `edges keep ${c.edgeKeep}s`,
    `max sync ${c.maxSyncSpeed}×`,
  ];

  return (
    <section className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Cleanup &amp; sync</h3>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={analyze} disabled={analyzing}>
          {analyzing ? <Loader2 className="animate-spin" /> : <RotateCw />} Re-analyze screen
        </Button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map((label) => (
          <span key={label} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            {label}
          </span>
        ))}
      </div>

      {analyzing && !plan ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Analyzing screen activity… about 0.1s per second of video.
        </div>
      ) : !plan ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No activity data yet. Click Re-analyze screen.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {formatTime(plan.sourceDuration)} → {formatTime(plan.outputDuration)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {plan.sourceDuration.toFixed(1)}s → {plan.outputDuration.toFixed(1)}s (
              {Math.round(((plan.outputDuration - plan.sourceDuration) / plan.sourceDuration) * 100)}%)
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Strip 1:</span>
            <Swatch color={STATE_COLOR.speaking} label="speaking" />
            <Swatch color={STATE_COLOR.moving} label="moving" />
            <Swatch color={STATE_COLOR.still} label="still" />
            <span className="ml-2 font-medium text-foreground">Strip 2:</span>
            <Swatch color={ACTION_COLOR.fast} label="fast-forward" />
            <Swatch color={ACTION_COLOR.freeze} label="freeze" />
            <Swatch color={ACTION_COLOR.cut} label="cut (marker on video)" />
          </div>

          <table className="mt-3 w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Video</th>
                <th className="py-1.5 pr-2 font-medium">Cleaned</th>
                <th className="py-1.5 pr-2 font-medium">Voice</th>
                <th className="py-1.5 pr-2 font-medium">Output</th>
                <th className="py-1.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {plan.decisions.map((d) => (
                <tr key={d.segmentId || "all"} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2 text-muted-foreground">{d.index + 1}</td>
                  <td className="py-1.5 pr-2">{d.original.toFixed(1)}s</td>
                  <td className="py-1.5 pr-2">{d.cleaned.toFixed(1)}s</td>
                  <td className="py-1.5 pr-2">
                    {d.voice === null ? "—" : `${d.voiceEstimated ? "≈" : ""}${d.voice.toFixed(1)}s`}
                  </td>
                  <td className="py-1.5 pr-2 font-medium">{d.output.toFixed(1)}s</td>
                  <td className={cn("py-1.5", d.action.includes("without narration") && "text-amber-600")}>{d.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.decisions.some((d) => d.voiceEstimated) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">≈ = no current voice clip yet, length estimated from the text.</p>
          )}

          <p className="mt-4 mb-1.5 text-[11px] font-medium text-muted-foreground">Cleanup ({plan.actions.length})</p>
          {plan.actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing to clean up.</p>
          ) : (
            <ul className="space-y-0.5">
              {plan.actions.map((a) => (
                <li
                  key={`${a.start}-${a.kind}`}
                  onClick={() => playback.seek(sourceToOutput(plan, a.start))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[#FAFAFB]"
                >
                  <span className="h-2 w-3 shrink-0 rounded-sm" style={{ background: ACTION_COLOR[a.kind] }} />
                  <span className="w-14 font-medium">{a.kind === "cut" ? "Cut" : `${c.fastSpeed}× speed`}</span>
                  <span className="font-mono text-[11px]">
                    {a.start.toFixed(1)}–{a.end.toFixed(1)}s
                  </span>
                  <span className="text-muted-foreground">
                    {(a.end - a.start).toFixed(1)}s · {REASON[a.reason]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ZoomDebug({ zoom, plan, playback }: { zoom: ZoomDetectionState; plan: SyncPlan; playback: Playback }) {
  const { detection, busy, error } = zoom;
  const c = detection?.config;
  const ranges = (z: { start: number }) => sourceToOutput(plan, z.start);
  const sourceNow = outputToSource(plan, playback.currentTime);

  return (
    <section className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Zoom detection</h3>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={zoom.rerun} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RotateCw />} Re-detect
        </Button>
      </div>
      {c && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[
            `full-screen > ${c.maxCoverage * 100}% ignored`,
            `busy cells > ${c.persistentShare * 100}% of ±${c.persistentWindow}s ignored`,
            `box ≤ ${c.maxBoxShare * 100}% of screen`,
            `≥ ${c.minEventPx} px changed`,
          ].map((label) => (
            <span key={label} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{error}</p>
      ) : !detection ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Finding where the screen changes…
        </div>
      ) : (
        <>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg bg-[#FAFAFB] px-3 py-2 text-xs">
            <span>
              <span className="font-medium">{detection.candidates.length} zoom candidates</span>
              <span className="text-muted-foreground"> · outlined on the preview while they happen</span>
            </span>
            <Switch size="sm" checked={zoom.showBoxes} onCheckedChange={zoom.setShowBoxes} />
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Ignored: {detection.skipped.fullScreenFrames} full-screen frames (scroll / page load),{" "}
            {detection.skipped.persistentCells} constantly changing cells (spinners / video), {detection.skipped.tooBig} events
            too big, {detection.skipped.tooSmall + detection.skipped.tooFaint} too small or faint (cursor, hover).
          </p>

          {detection.candidates.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No localized changes found in this recording.</p>
          ) : (
            <table className="mt-3 w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b text-left text-[11px] text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">At (video)</th>
                  <th className="py-1.5 pr-2 font-medium">Source</th>
                  <th className="py-1.5 pr-2 font-medium">Length</th>
                  <th className="py-1.5 pr-2 font-medium">Box</th>
                  <th className="py-1.5 font-medium">Strength</th>
                </tr>
              </thead>
              <tbody>
                {detection.candidates.map((z) => {
                  const removed = !plan.pieces.some((p) => z.end > p.sourceStart && z.start < p.sourceEnd);
                  const active = sourceNow >= z.start - 0.2 && sourceNow <= z.end + 0.8;
                  return (
                    <tr
                      key={z.id}
                      onClick={() => playback.seek(ranges(z))}
                      className={cn(
                        "cursor-pointer border-b border-border/60 transition-colors hover:bg-[#FAFAFB]",
                        active && "bg-brand/[0.06]",
                        removed && "opacity-45",
                      )}
                    >
                      <td className="py-1.5 pr-2 font-mono text-[11px]">{removed ? "cut" : formatTime(ranges(z))}</td>
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-muted-foreground">{z.start.toFixed(1)}s</td>
                      <td className="py-1.5 pr-2">{(z.end - z.start).toFixed(1)}s</td>
                      <td className="py-1.5 pr-2">
                        {Math.round(z.w * 100)}×{Math.round(z.h * 100)}% <span className="text-muted-foreground">({Math.round(z.w * z.h * 100)}%)</span>
                      </td>
                      <td className="py-1.5">{z.changedPx.toLocaleString()} px</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
