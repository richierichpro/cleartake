"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { FPS } from "@/remotion/demo-video";

// Playback state shared by the preview, control bar, timeline and script.
// Backed by the Remotion Player; all times are output (edited video) seconds.
export function usePlayback(duration: number) {
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const stopAt = useRef<number | null>(null); // set by playRange
  const lastFrame = Math.max(0, Math.round(duration * FPS) - 1);

  useEffect(() => {
    if (!player) return;
    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      setFrame(detail.frame);
      if (stopAt.current !== null && detail.frame >= stopAt.current) {
        stopAt.current = null;
        player.pause();
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
    };
  }, [player]);

  const seek = useCallback(
    (t: number) => {
      stopAt.current = null;
      const f = Math.max(0, Math.min(Math.round(t * FPS), lastFrame));
      player?.seekTo(f);
      setFrame(f);
    },
    [player, lastFrame],
  );

  const toggle = useCallback(() => {
    if (!player) return;
    stopAt.current = null;
    if (!player.isPlaying() && player.getCurrentFrame() >= lastFrame) player.seekTo(0);
    player.toggle();
  }, [player, lastFrame]);

  /** Plays [start, end) of the output and pauses at the end. */
  const playRange = useCallback(
    (start: number, end: number) => {
      if (!player) return;
      seek(start);
      stopAt.current = Math.round(end * FPS);
      player.play();
    },
    [player, seek],
  );

  const setVolume = useCallback(
    (value: number) => {
      setVolumeState(value);
      setMuted(value === 0);
      player?.setVolume(value);
      if (value === 0) player?.mute();
      else player?.unmute();
    },
    [player],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (m) player?.unmute();
      else player?.mute();
      return !m;
    });
  }, [player]);

  return {
    currentTime: frame / FPS,
    duration,
    playing,
    volume,
    muted,
    seek,
    toggle,
    playRange,
    setVolume,
    toggleMute,
    attachPlayer: setPlayer, // pass as <Player ref={...}>
  };
}

export type Playback = ReturnType<typeof usePlayback>;
