"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Mic, Scissors, Snowflake } from "lucide-react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { clipStatus, estimateSeconds } from "@/lib/voice-settings";
import { outputToSource, pieceLength, segmentRanges, sourceToOutput, SYNC_CONFIG, type SyncPlan } from "@/lib/sync";
import type { Edits } from "./use-edits";
import type { Segment, VoiceSettings } from "@/lib/types";
import type { Playback } from "./use-playback";

const PAD = 16; // horizontal breathing room so 0:00 and the end aren't glued to the edges
const RULER_H = 28;
const VIDEO_TOP = RULER_H + 12;
const VOICE_TOP = VIDEO_TOP + 56 + 8;
const STRIP_TOP = VOICE_TOP + 32 + 6; // debug strips: activity, then plan

export const STATE_COLOR = { speaking: "#FF8A6B", moving: "#7C93F6", still: "#E1E1E6" } as const;
export const ACTION_COLOR = { cut: "#3A3A40", fast: "#7C93F6", freeze: "#FF5C35" } as const;

// Ruler spacing: pick the smallest major step that keeps labels ~72px apart.
const STEPS: [major: number, minorDivisions: number][] = [
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 6], [120, 4], [300, 5], [600, 5],
];

const runs = <T,>(arr: T[]) => {
  const out: { value: T; start: number; end: number }[] = [];
  arr.forEach((v, i) => {
    const last = out[out.length - 1];
    if (last && last.value === v) last.end = i + 1;
    else out.push({ value: v, start: i, end: i + 1 });
  });
  return out;
};

interface Props {
  playback: Playback;
  zoom: number;
  thumbnailUrl: string | null;
  segments: Segment[] | undefined;
  voice: VoiceSettings;
  plan: SyncPlan; // everything on the timeline is in output (edited video) time
  debug: boolean; // show activity + plan strips
  edits: Edits; // trim handles, splits, selection, cut markers (Step 9)
}

type Drag =
  | { mode: "scrub" }
  | { mode: "select"; x0: number; t0: number; moved: boolean }
  | { mode: "trim"; side: "start" | "end"; t: number };

export function Timeline({ playback, zoom, thumbnailUrl, segments, voice, plan, debug, edits }: Props) {
  const { currentTime, seek } = playback;
  const duration = playback.duration || 1;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = drag !== null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pps = (Math.max(0, viewW - PAD * 2) / duration) * zoom; // pixels per second
  const contentW = duration * pps + PAD * 2;
  const xOf = (t: number) => PAD + t * pps;
  const [major, divisions] = STEPS.find(([m]) => m * pps >= 72) ?? STEPS[STEPS.length - 1];
  const minorPx = (major / divisions) * pps;

  // Voice blocks in output time.
  const ranges = segmentRanges(plan);
  const voiceBlocks: {
    key: string;
    index: number;
    start: number;
    length: number;
    label: string;
    kind: "clip" | "missing" | "speech";
    outdated?: boolean;
  }[] = [];
  (segments ?? []).forEach((seg, index) => {
    const range = ranges.get(seg.id);
    if (!range || seg.deleted) return;
    if (voice.mode === "original") {
      const start = sourceToOutput(plan, seg.speechStart);
      const end = sourceToOutput(plan, seg.speechEnd);
      if (end > start) voiceBlocks.push({ key: seg.id, index, start, length: end - start, label: `${(end - start).toFixed(1)}s`, kind: "speech" });
      return;
    }
    const placed = plan.voice.find((v) => v.segmentId === seg.id);
    const status = clipStatus(seg, voice);
    if (placed) {
      voiceBlocks.push({ key: seg.id, index, start: placed.outputStart, length: placed.duration, label: `${placed.duration.toFixed(1)}s`, kind: "clip" });
    } else if (status === "none" || status === "outdated") {
      voiceBlocks.push({
        key: seg.id,
        index,
        start: range.start,
        length: Math.min(estimateSeconds(seg.text), range.end - range.start),
        label: status === "none" ? "no voice yet" : "outdated",
        kind: "missing",
        outdated: status === "outdated",
      });
    }
  });

  const fps = SYNC_CONFIG.fps;
  const activityRuns = runs(plan.states).map((r) => ({ value: r.value, start: r.start / fps, end: r.end / fps }));

  // ---- Step 9: pieces between split points, selection, trim, cut markers ----
  const src = (t: number) => outputToSource(plan, t);
  const sourceDuration = plan.sourceDuration;
  function selectPieceAt(t: number) {
    const ts = src(t);
    const before = edits.splits.filter((x) => x <= ts);
    const after = edits.splits.filter((x) => x > ts);
    if (!before.length && !after.length) return edits.setSelection(null); // no splits yet: nothing to select
    edits.setSelection({ start: before.length ? before[before.length - 1] : 0, end: after.length ? after[0] : sourceDuration });
  }
  function commitTrim(d: Extract<Drag, { mode: "trim" }>) {
    const current = edits.trim ?? { start: 0, end: sourceDuration };
    if (d.side === "start" && d.t > 0.05) edits.setTrim({ start: src(d.t), end: current.end });
    if (d.side === "end" && d.t < duration - 0.05) edits.setTrim({ start: current.start, end: src(d.t) });
  }
  function startTrim(e: React.PointerEvent, side: "start" | "end") {
    e.stopPropagation();
    scrollerRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode: "trim", side, t: side === "start" ? 0 : duration });
  }
  // User removals (cuts and trim) get restorable ✂ markers where the video resumes.
  const userRemoved = [
    ...edits.cuts.map((c) => ({ key: c.id, start: c.start, end: c.end, restore: () => edits.restoreCut(c.id), label: c.segmentId ? "Deleted paragraph" : "Cut" })),
    ...(edits.trim && edits.trim.start > 0.01
      ? [{ key: "trim-start", start: 0, end: edits.trim.start, restore: () => edits.setTrim({ start: 0, end: edits.trim!.end }), label: "Trimmed start" }]
      : []),
    ...(edits.trim && edits.trim.end < sourceDuration - 0.01
      ? [{ key: "trim-end", start: edits.trim.end, end: sourceDuration, restore: () => edits.setTrim({ start: edits.trim!.start, end: sourceDuration }), label: "Trimmed end" }]
      : []),
  ];
  const coveredByUser = (a: number, b: number) => userRemoved.some((r) => r.start < b && r.end > a);
  const inKept = (t: number) => plan.pieces.some((p) => t > p.sourceStart + 0.01 && t < p.sourceEnd - 0.01);

  const timeAt = (clientX: number) => {
    const rect = scrollerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollerRef.current!.scrollLeft;
    return Math.max(0, Math.min(duration, (x - PAD) / pps));
  };

  // Keep the playhead in view whenever it moves (playing or seeking); manual scrolling is left alone.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || zoom === 1) return;
    const x = xOf(currentTime);
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - el.clientWidth * 0.2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = xOf(currentTime) - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className={cn("shrink-0 border-t bg-white transition-[height]", debug ? "h-[176px]" : "h-[164px]")}>
      <div
        ref={scrollerRef}
        className="scroll-thin relative h-full overflow-x-auto overflow-y-hidden select-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = timeAt(e.clientX);
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          // On the video track: click selects a piece, drag selects a range. Elsewhere: scrub.
          if (y >= VIDEO_TOP && y <= VIDEO_TOP + 56) setDrag({ mode: "select", x0: e.clientX, t0: t, moved: false });
          else {
            setDrag({ mode: "scrub" });
            seek(t);
          }
        }}
        onPointerMove={(e) => {
          const t = timeAt(e.clientX);
          setHoverT(t);
          if (drag?.mode === "scrub") seek(t);
          else if (drag?.mode === "trim") setDrag({ ...drag, t });
          else if (drag?.mode === "select" && (drag.moved || Math.abs(e.clientX - drag.x0) > 4)) {
            if (!drag.moved) setDrag({ ...drag, moved: true });
            const [a, b] = [Math.min(drag.t0, t), Math.max(drag.t0, t)];
            edits.setSelection({ start: outputToSource(plan, a), end: outputToSource(plan, b) });
          }
        }}
        onPointerUp={(e) => {
          const t = timeAt(e.clientX);
          if (drag?.mode === "select" && !drag.moved) {
            seek(t);
            selectPieceAt(t);
          } else if (drag?.mode === "trim") commitTrim(drag);
          setDrag(null);
        }}
        onPointerLeave={() => setHoverT(null)}
      >
        {viewW > 0 && (
          <div className="relative h-full cursor-text" style={{ width: contentW }}>
            {/* Ruler */}
            <div className="absolute inset-x-0 top-0 border-b" style={{ height: RULER_H }}>
              <div
                className="absolute bottom-0 h-1.5"
                style={{
                  left: PAD,
                  width: duration * pps,
                  backgroundImage: `repeating-linear-gradient(to right, #D4D4DA 0 1px, transparent 1px ${minorPx}px)`,
                }}
              />
              {Array.from({ length: Math.floor(duration / major) + 1 }, (_, i) => (
                <div key={i} className="absolute bottom-0" style={{ left: xOf(i * major) }}>
                  <div className="h-2.5 w-px bg-[#B4B4BC]" />
                  <span className="absolute bottom-3 left-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(i * major)}
                  </span>
                </div>
              ))}
            </div>

            {/* Video track: the plan's pieces in output time. Cleanup cuts leave a small marker. */}
            {plan.pieces.map((p, i) => {
              const prev = plan.pieces[i - 1];
              const newParagraph = !prev || prev.segmentId !== p.segmentId;
              const gap = prev && p.sourceStart - prev.sourceEnd > 0.05 && !coveredByUser(prev.sourceEnd, p.sourceStart);
              const cutBefore = gap ? p.sourceStart - prev.sourceEnd : 0;
              const moving = (p.sourceEnd - p.sourceStart) / p.speed;
              const segIndex = segments?.findIndex((s) => s.id === p.segmentId) ?? -1;
              return (
                <div key={i}>
                  <div
                    className="absolute h-14 overflow-hidden rounded-md border bg-muted"
                    style={{
                      top: VIDEO_TOP,
                      left: xOf(p.outputStart) + (newParagraph ? 1 : 0),
                      width: Math.max(2, pieceLength(p) * pps - (newParagraph ? 1 : 0)),
                      ...(thumbnailUrl && {
                        backgroundImage: `url(${thumbnailUrl})`,
                        backgroundSize: "auto 100%",
                        backgroundRepeat: "repeat-x",
                        backgroundPositionX: -(p.sourceStart * pps), // frames continue across pieces
                      }),
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/5 to-transparent" />
                    {p.freezeAfter > 0 && (
                      <div
                        className="absolute inset-y-0 right-0 flex items-end justify-end bg-[repeating-linear-gradient(135deg,rgba(255,92,53,0.28)_0_4px,rgba(255,255,255,0.15)_4px_8px)] p-1"
                        style={{ width: p.freezeAfter * pps }}
                      >
                        <span className="flex items-center gap-0.5 rounded bg-white/90 px-1 text-[9.5px] font-medium text-brand">
                          <Snowflake className="size-2.5" /> {p.freezeAfter.toFixed(1)}s
                        </span>
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5 flex gap-1">
                      {newParagraph && (
                        <span className="flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          {segIndex >= 0 ? (
                            segIndex + 1
                          ) : (
                            <>
                              <Film className="size-3" /> Recording · {formatTime(duration)}
                            </>
                          )}
                        </span>
                      )}
                      {Math.abs(p.speed - 1) > 0.02 && moving * pps > 34 && (
                        <span className="rounded-md bg-white/90 px-1 py-0.5 text-[10px] font-medium text-foreground tabular-nums">
                          {p.speed.toFixed(p.speed >= 3 ? 0 : 1)}×
                        </span>
                      )}
                    </div>
                  </div>
                  {cutBefore > 0 && (
                    <div
                      title={`Cleanup removed ${cutBefore.toFixed(1)}s`}
                      className="absolute z-[1] h-14 w-[3px] -translate-x-1/2 rounded-full bg-foreground/70 ring-2 ring-white"
                      style={{ top: VIDEO_TOP, left: xOf(p.outputStart) }}
                    />
                  )}
                </div>
              );
            })}

            {/* Voice track: AI clips exactly where they play; your own speech in original-voice mode */}
            {voiceBlocks.length ? (
              voiceBlocks.map((b) => {
                const active = currentTime >= b.start && currentTime < b.start + b.length;
                return (
                  <div
                    key={b.key}
                    className={cn(
                      "absolute flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] transition-colors duration-150",
                      b.kind === "missing"
                        ? "border-dashed bg-white text-muted-foreground/70"
                        : active
                          ? "border-brand/50 bg-brand/[0.07] text-foreground"
                          : "border-[#DCDCE1] bg-[#F3F3F5] text-muted-foreground",
                    )}
                    style={{ top: VOICE_TOP, left: xOf(b.start), width: Math.max(4, b.length * pps) }}
                  >
                    {b.outdated ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                    ) : (
                      <Mic className={cn("size-3 shrink-0", active && "text-brand")} />
                    )}
                    <span className="shrink-0 font-medium">{b.index + 1}</span>
                    <span className="truncate opacity-70">{b.label}</span>
                  </div>
                );
              })
            ) : (
              <div
                className="absolute flex h-8 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground"
                style={{ top: VOICE_TOP, left: xOf(0), width: duration * pps }}
              >
                {segments ? "No narration" : "Your voice will appear here after transcription"}
              </div>
            )}

            {/* Split points: click one to remove it */}
            {edits.splits.filter(inKept).map((t) => (
              <button
                key={`split${t}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => edits.removeSplit(t)}
                title="Remove split"
                aria-label="Remove split"
                className="group/split absolute z-[2] flex w-3 -translate-x-1/2 justify-center"
                style={{ top: VIDEO_TOP - 3, height: 62, left: xOf(sourceToOutput(plan, t)) }}
              >
                <span className="h-full w-[2px] rounded-full bg-white shadow-[0_0_0_1px_rgba(17,17,19,0.45)] transition-colors group-hover/split:bg-brand" />
                <span className="absolute -top-2 flex size-3.5 scale-75 items-center justify-center rounded-full bg-foreground text-[9px] leading-none text-white opacity-0 transition-all duration-150 group-hover/split:scale-100 group-hover/split:opacity-100">
                  ×
                </span>
              </button>
            ))}

            {/* Selection: click a piece or drag a range on the video track, then Delete */}
            {edits.selection && (() => {
              const a = sourceToOutput(plan, edits.selection.start);
              const b = sourceToOutput(plan, edits.selection.end);
              return (
                <div
                  className="pointer-events-none absolute z-[3] rounded-md border-2 border-brand bg-brand/15"
                  style={{ top: VIDEO_TOP - 2, height: 60, left: xOf(a), width: Math.max(4, (b - a) * pps) }}
                >
                  {(b - a) * pps > 70 && (
                    <span className="absolute right-1 bottom-1 rounded bg-brand px-1 text-[10px] font-medium text-white">
                      {(edits.selection.end - edits.selection.start).toFixed(1)}s · Delete to cut
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Trim preview while dragging a handle */}
            {drag?.mode === "trim" && (
              <div
                className="pointer-events-none absolute z-[3] rounded-md bg-foreground/45"
                style={{
                  top: VIDEO_TOP,
                  height: 56,
                  left: xOf(drag.side === "start" ? 0 : drag.t),
                  width: (drag.side === "start" ? drag.t : duration - drag.t) * pps,
                }}
              />
            )}

            {/* Trim handles */}
            {(["start", "end"] as const).map((side) => (
              <div
                key={side}
                onPointerDown={(e) => startTrim(e, side)}
                title={side === "start" ? "Drag to trim the start" : "Drag to trim the end"}
                className="group/handle absolute z-[4] flex w-2.5 cursor-ew-resize items-center justify-center rounded-[4px] border bg-white shadow-sm transition-colors hover:border-brand"
                style={{
                  top: VIDEO_TOP,
                  height: 56,
                  left: xOf(drag?.mode === "trim" && drag.side === side ? drag.t : side === "start" ? 0 : duration) - 5,
                }}
              >
                <span className="h-5 w-[2px] rounded-full bg-muted-foreground/50 group-hover/handle:bg-brand" />
              </div>
            ))}

            {/* ✂ markers for your cuts and trims: click to restore */}
            {userRemoved.map((r) => (
              <button
                key={r.key}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={r.restore}
                title={`${r.label} · ${(r.end - r.start).toFixed(1)}s removed. Click to restore.`}
                aria-label={`Restore ${r.label.toLowerCase()} (${(r.end - r.start).toFixed(1)}s)`}
                className="absolute z-[5] flex size-[18px] -translate-x-1/2 items-center justify-center rounded-full border border-brand bg-white text-brand shadow-sm transition-transform duration-150 hover:scale-110 hover:bg-brand hover:text-white"
                style={{ top: VIDEO_TOP - 9, left: xOf(Math.min(sourceToOutput(plan, r.start), duration)) }}
              >
                <Scissors className="size-2.5" />
              </button>
            ))}

            {/* Debug strips: activity (speaking / moving / still) and plan (fast-forward / freeze), mapped to output time */}
            {debug && plan.states.length > 0 && (
              <>
                {plan.pieces.flatMap((p, pi) => {
                  const moving = (p.sourceEnd - p.sourceStart) / p.speed;
                  const blocks = activityRuns
                    .filter((r) => r.end > p.sourceStart && r.start < p.sourceEnd)
                    .map((r) => {
                      const a = Math.max(r.start, p.sourceStart);
                      const b = Math.min(r.end, p.sourceEnd);
                      return (
                        <div
                          key={`s${pi}-${a}`}
                          className="absolute h-[5px]"
                          style={{
                            top: STRIP_TOP,
                            left: xOf(p.outputStart + (a - p.sourceStart) / p.speed),
                            width: ((b - a) / p.speed) * pps,
                            background: STATE_COLOR[r.value],
                          }}
                        />
                      );
                    });
                  return [
                    ...blocks,
                    <div
                      key={`p${pi}`}
                      className="absolute h-[5px]"
                      style={{
                        top: STRIP_TOP + 8,
                        left: xOf(p.outputStart),
                        width: moving * pps,
                        background: p.speed > 2.5 ? ACTION_COLOR.fast : "#E1E1E6",
                      }}
                    />,
                    p.freezeAfter > 0 && (
                      <div
                        key={`f${pi}`}
                        className="absolute h-[5px]"
                        style={{ top: STRIP_TOP + 8, left: xOf(p.outputStart + moving), width: p.freezeAfter * pps, background: ACTION_COLOR.freeze }}
                      />
                    ),
                  ];
                })}
              </>
            )}

            {/* Hover guide */}
            {hoverT !== null && !dragging && (
              <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground/15" style={{ left: xOf(hoverT) }} />
            )}

            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-10" style={{ left: xOf(currentTime) }}>
              <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-brand" />
              <div className="absolute top-0 -left-[6px] h-3.5 w-3 rounded-b-[4px] rounded-t-[2px] bg-brand shadow-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
