"use client";

import { Captions, Minus, Pause, Play, Plus, Scissors, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Playback } from "./use-playback";

export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];

interface Props {
  playback: Playback;
  zoomIndex: number;
  onZoomIndex: (i: number) => void;
}

export function ControlBar({ playback, zoomIndex, onZoomIndex }: Props) {
  const { playing, currentTime, duration, volume, muted } = playback;

  return (
    <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t bg-white px-3">
      <div className="flex items-center gap-1">
        <IconButton label="Captions" hint="Available once the AI voice is generated" inactive>
          <Captions />
        </IconButton>
        <IconButton label="Split at playhead" shortcut="S" hint="Available once the script is ready" inactive>
          <Scissors />
        </IconButton>
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                onClick={playback.toggle}
                aria-label={playing ? "Pause" : "Play"}
                className="rounded-full"
              />
            }
          >
            {playing ? <Pause className="fill-current" /> : <Play className="ml-px fill-current" />}
          </TooltipTrigger>
          <TooltipContent>
            {playing ? "Pause" : "Play"} <Kbd>Space</Kbd>
          </TooltipContent>
        </Tooltip>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          <span className="text-foreground">{formatTime(currentTime)}</span> / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center justify-end gap-1">
        <IconButton label={muted ? "Unmute" : "Mute"} onClick={playback.toggleMute}>
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </IconButton>
        <div className="mr-2 w-20">
          <Slider
            value={[muted ? 0 : volume * 100]}
            onValueChange={(v) => playback.setVolume((Array.isArray(v) ? v[0] : v) / 100)}
            aria-label="Volume"
          />
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <IconButton label="Zoom out timeline" onClick={() => onZoomIndex(Math.max(0, zoomIndex - 1))} disabled={zoomIndex === 0}>
          <Minus />
        </IconButton>
        <span className="w-9 text-center font-mono text-[11px] text-muted-foreground tabular-nums">
          {ZOOM_LEVELS[zoomIndex]}x
        </span>
        <IconButton
          label="Zoom in timeline"
          onClick={() => onZoomIndex(Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1))}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
        >
          <Plus />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  hint,
  shortcut,
  inactive,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  shortcut?: string;
  inactive?: boolean; // looks disabled but still shows its tooltip
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-disabled={inactive || undefined}
            disabled={disabled}
            onClick={inactive ? undefined : onClick}
            className={cn("text-muted-foreground hover:text-foreground", inactive && "cursor-default opacity-45 hover:bg-transparent hover:text-muted-foreground")}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="flex items-center gap-1.5">
          {label} {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
        {hint && <span className="text-background/60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-background/20 px-1 font-sans text-[10px] leading-4 text-background/70">{children}</kbd>
  );
}
