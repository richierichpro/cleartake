"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { formatTime } from "@/lib/format";
import type { Playback } from "./use-playback";

const PAD = 16; // horizontal breathing room so 0:00 and the end aren't glued to the edges
const RULER_H = 28;

// Ruler spacing: pick the smallest major step that keeps labels ~72px apart.
const STEPS: [major: number, minorDivisions: number][] = [
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 6], [120, 4], [300, 5], [600, 5],
];

interface Props {
  playback: Playback;
  zoom: number;
  thumbnailUrl: string | null;
}

export function Timeline({ playback, zoom, thumbnailUrl }: Props) {
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

            {/* Video track */}
            <div className="absolute" style={{ top: RULER_H + 12, left: xOf(0), width: duration * pps }}>
              <div
                className="relative h-14 overflow-hidden rounded-lg border bg-muted"
                style={
                  thumbnailUrl
                    ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }
                    : undefined
                }
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
                <span className="absolute top-1.5 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  <Film className="size-3" /> Recording · {formatTime(duration)}
                </span>
              </div>
              <div className="mt-2 flex h-9 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
                Script segments and zooms will appear here
              </div>
            </div>

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
