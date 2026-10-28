"use client";

import { Crosshair, Loader2, Sparkles, Trash2, ZoomIn } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ZOOM_LIMITS } from "@/lib/zooms";
import type { Zooms } from "./use-zooms";

export function ZoomsTab({ zooms }: { zooms: Zooms }) {
  const z = zooms.selected;
  const t = z ? zooms.timeline.find((x) => x.id === z.id) : null;

  return (
    <div className="space-y-5 px-5 py-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[#FAFAFB]">
        <div className="flex-1">
          <p className="text-sm font-medium">Add zoom effects</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Turn all zooms on or off without deleting them.
          </p>
        </div>
        <Switch checked={zooms.enabled} onCheckedChange={zooms.setEnabled} className="mt-0.5" />
      </label>

      <button
        onClick={zooms.autoDetect}
        disabled={zooms.detecting}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand/90 disabled:opacity-70"
      >
        {zooms.detecting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {zooms.detecting ? "Finding what you point at…" : "Auto-detect zooms"}
      </button>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Zooms in where you name something on screen. Hover over the timeline&apos;s zoom track to add a zoom, click one to
        edit it.
      </p>

      {z && t ? (
        <div className="rounded-xl border">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <ZoomIn className="size-4 text-brand" />
            <p className="text-sm font-medium">Selected zoom</p>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatTime(t.outStart)}–{formatTime(t.outEnd)}
            </span>
            <button
              onClick={() => zooms.remove(z.id)}
              aria-label="Delete zoom"
              className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="space-y-5 p-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-medium">Zoom level</p>
                <span className="text-[13px] tabular-nums">{z.scale.toFixed(1)}×</span>
              </div>
              <Slider
                value={[z.scale]}
                min={ZOOM_LIMITS.minScale}
                max={ZOOM_LIMITS.maxScale}
                step={0.1}
                onValueChange={(v) => zooms.update(z.id, { scale: Math.round((Array.isArray(v) ? v[0] : v) * 10) / 10 })}
                aria-label="Zoom level"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{ZOOM_LIMITS.minScale}×</span>
                <span>{ZOOM_LIMITS.maxScale}×</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg bg-[#FAFAFB] p-3">
              <Crosshair className="mt-0.5 size-4 shrink-0 text-brand" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Click on the video</span> to choose where this zoom points. The
                dashed frame shows what will be visible. Press Esc when you&apos;re done to watch it play.
              </p>
            </div>
            <label className="flex cursor-pointer items-center justify-between text-[13px]">
              <span>Enabled</span>
              <Switch size="sm" checked={z.enabled} onCheckedChange={(enabled) => zooms.update(z.id, { enabled })} />
            </label>
          </div>
        </div>
      ) : zooms.items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
            <ZoomIn className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No zooms yet</p>
          <p className="mt-1 max-w-60 text-[13px] leading-relaxed text-muted-foreground">
            Auto-detect them, or hover over the zoom track under the timeline and click to add one.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-[13px] font-medium">Zooms ({zooms.items.length})</p>
          <ul className="space-y-1">
            {zooms.timeline.map((x) => (
              <li key={x.id}>
                <button
                  onClick={() => zooms.select(x.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#FAFAFB]",
                    !(zooms.enabled && x.enabled) && "opacity-50",
                  )}
                >
                  <ZoomIn className="size-3.5 text-brand" />
                  <span className="font-mono text-xs tabular-nums">
                    {formatTime(x.outStart)}–{formatTime(x.outEnd)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{x.scale.toFixed(1)}×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
