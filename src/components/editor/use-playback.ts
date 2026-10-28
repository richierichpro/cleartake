"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { FPS } from "@/remotion/demo-video";

// Playback state shared by the preview, control bar, timeline and script.
// Backed by the Remotion Player; all times are output (edited video) seconds. The Player also plays
// `lead` seconds of intro before output 0 and `tail` seconds of outro after it (Step 15b); during those
// the playhead rests at the start / end.
export function usePlayback(duration: number, lead = 0, tail = 0) {
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const stopAt = useRef<number | null>(null); // set by playRange
  const leadFrames = Math.round(lead * FPS);
  const lastFrame = Math.max(0, Math.round((lead + duration + tail) * FPS) - 1); // of the Player

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

  // Rest on the video's first frame, not the start of the intro (pressing play there still plays the intro).
  useEffect(() => {
    if (player && !player.isPlaying() && player.getCurrentFrame() < leadFrames) player.seekTo(leadFrames);
  }, [player, leadFrames]);

  const seek = useCallback(
    (t: number) => {
      stopAt.current = null;
      const f = Math.max(0, Math.min(leadFrames + Math.round(t * FPS), lastFrame));
      player?.seekTo(f);
      setFrame(f);
    },
    [player, leadFrames, lastFrame],
  );

  const toggle = useCallback(() => {
    if (!player) return;
    stopAt.current = null;
    // Playing from the very start (or after the end) includes the intro.
    if (!player.isPlaying() && (player.getCurrentFrame() >= lastFrame || player.getCurrentFrame() === leadFrames)) player.seekTo(0);
    player.toggle();
  }, [player, leadFrames, lastFrame]);

  /** Plays [start, end) of the output and pauses at the end. */
  const playRange = useCallback(
    (start: number, end: number) => {
      if (!player) return;
      seek(start);
      stopAt.current = leadFrames + Math.round(end * FPS);
      player.play();
    },
    [player, seek, leadFrames],
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
    currentTime: Math.max(0, Math.min(duration, (frame - leadFrames) / FPS)),
    /** Which part the Player is in: the intro card, the video, or the outro card. */
    scene: (frame < leadFrames ? "intro" : frame - leadFrames >= Math.round(duration * FPS) && tail > 0 ? "outro" : "video") as
      | "intro"
      | "video"
      | "outro",
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
