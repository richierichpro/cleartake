"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Mic, Snowflake } from "lucide-react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { clipStatus, estimateSeconds } from "@/lib/voice-settings";
import { pieceLength, segmentRanges, sourceToOutput, SYNC_CONFIG, type SyncPlan } from "@/lib/sync";
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
}

export function Timeline({ playback, zoom, thumbnailUrl, segments, voice, plan, debug }: Props) {
  const { currentTime, seek } = playback;
  const duration = playback.duration || 1;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

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
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const t = timeAt(e.clientX);
          if (dragging) seek(t);
          setHoverT(t);
        }}
        onPointerUp={() => setDragging(false)}
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
              const cutBefore = prev && p.sourceStart - prev.sourceEnd > 0.05 ? p.sourceStart - prev.sourceEnd : 0;
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
                      title={`Cut ${cutBefore.toFixed(1)}s`}
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
