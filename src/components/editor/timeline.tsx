"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Mic } from "lucide-react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Segment } from "@/lib/types";
import type { Playback } from "./use-playback";

const PAD = 16; // horizontal breathing room so 0:00 and the end aren't glued to the edges
const RULER_H = 28;
const VIDEO_TOP = RULER_H + 12;
const VOICE_TOP = VIDEO_TOP + 56 + 8;

// Ruler spacing: pick the smallest major step that keeps labels ~72px apart.
const STEPS: [major: number, minorDivisions: number][] = [
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 6], [120, 4], [300, 5], [600, 5],
];

interface Props {
  playback: Playback;
  zoom: number;
  thumbnailUrl: string | null;
  segments: Segment[] | undefined;
}

export function Timeline({ playback, zoom, thumbnailUrl, segments }: Props) {
  const { currentTime, playing, seek } = playback;
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

  const timeAt = (clientX: number) => {
    const rect = scrollerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollerRef.current!.scrollLeft;
    return Math.max(0, Math.min(duration, (x - PAD) / pps));
  };

  // Keep the playhead in view while playing, and after zooming.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !playing || zoom === 1) return;
    const x = xOf(currentTime);
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - el.clientWidth * 0.2;
  });
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = xOf(currentTime) - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className="h-[164px] shrink-0 border-t bg-white">
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

            {/* Video track: one filmstrip, split at paragraph boundaries */}
            {(segments?.length ? segments : [null]).map((seg, i) => {
              const from = seg?.start ?? 0;
              const to = seg?.end ?? duration;
              const split = !!segments?.length;
              return (
                <div
                  key={seg?.id ?? "all"}
                  className="absolute h-14 overflow-hidden rounded-lg border bg-muted"
                  style={{
                    top: VIDEO_TOP,
                    left: xOf(from) + (split ? 1 : 0),
                    width: Math.max(2, (to - from) * pps - (split ? 2 : 0)),
                    ...(thumbnailUrl && {
                      backgroundImage: `url(${thumbnailUrl})`,
                      backgroundSize: "auto 100%",
                      backgroundRepeat: "repeat-x",
                      backgroundPositionX: -(from * pps), // frames continue across the splits
                    }),
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/5 to-transparent" />
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {split ? (
                      i + 1
                    ) : (
                      <>
                        <Film className="size-3" /> Recording · {formatTime(duration)}
                      </>
                    )}
                  </span>
                </div>
              );
            })}

            {/* Voice track: only where there's narration, silence stays empty */}
            {segments?.length ? (
              segments.map((seg, i) => {
                const active = currentTime >= seg.speechStart && currentTime < seg.speechEnd;
                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "absolute flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] transition-colors duration-150",
                      seg.isRetake
                        ? "border-dashed bg-white text-muted-foreground/70"
                        : active
                          ? "border-brand/50 bg-brand/[0.07] text-foreground"
                          : "border-[#DCDCE1] bg-[#F3F3F5] text-muted-foreground",
                    )}
                    style={{
                      top: VOICE_TOP,
                      left: xOf(seg.speechStart),
                      width: Math.max(4, (seg.speechEnd - seg.speechStart) * pps),
                    }}
                  >
                    <Mic className={cn("size-3 shrink-0", active && "text-brand")} />
                    <span className="shrink-0 font-medium">{i + 1}</span>
                    <span className="truncate opacity-70">
                      {seg.isRetake ? "retake" : `${(seg.speechEnd - seg.speechStart).toFixed(1)}s`}
                    </span>
                  </div>
                );
              })
            ) : (
              <div
                className="absolute flex h-8 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground"
                style={{ top: VOICE_TOP, left: xOf(0), width: duration * pps }}
              >
                Your voice will appear here after transcription
              </div>
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
