"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Playback state shared by the preview, control bar and timeline.
// Step 7 swaps the <video> for a Remotion Player behind this same interface.
export function usePlayback(initialDuration: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const stopAt = useRef<number | null>(null); // set by playRange
  const restoreMuted = useRef<boolean | null>(null); // playRange can mute the recording while an AI clip plays

  const endRange = useCallback(() => {
    stopAt.current = null;
    if (restoreMuted.current !== null && videoRef.current) videoRef.current.muted = restoreMuted.current;
    restoreMuted.current = null;
  }, []);

  // Smooth playhead: timeupdate only fires ~4x/s, so poll on animation frames while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && stopAt.current !== null && v.currentTime >= stopAt.current) {
        v.pause();
        endRange();
      }
      if (v) setCurrentTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, endRange]);

  const seek = useCallback(
    (t: number) => {
      endRange();
      const clamped = Math.max(0, Math.min(t, duration || 0));
      if (videoRef.current) videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration, endRange],
  );

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    endRange();
    if (v.paused) {
      if (v.ended || v.currentTime >= (duration || v.duration) - 0.05) v.currentTime = 0;
      v.play().catch(() => {});
    } else v.pause();
  }, [duration, endRange]);

  /** Plays [start, end) and pauses at the end. `muted` silences the recording for that range only. */
  const playRange = useCallback(
    (start: number, end: number, opts: { muted?: boolean } = {}) => {
      const v = videoRef.current;
      if (!v) return;
      seek(start);
      stopAt.current = end;
      if (opts.muted) {
        restoreMuted.current = v.muted;
        v.muted = true;
      }
      v.play().catch(() => {});
    },
    [seek],
  );

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    setMutedState(value === 0);
    if (videoRef.current) {
      videoRef.current.volume = value;
      videoRef.current.muted = value === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  }, []);

  // Event handlers to spread onto the <video> element.
  const videoProps = {
    ref: videoRef,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onSeeked: () => videoRef.current && setCurrentTime(videoRef.current.currentTime),
    onLoadedMetadata: () => {
      const d = videoRef.current?.duration;
      if (d && Number.isFinite(d) && !initialDuration) setDuration(d);
    },
  };

  return { currentTime, duration, playing, volume, muted, seek, toggle, playRange, setVolume, toggleMute, videoProps };
}

export type Playback = ReturnType<typeof usePlayback>;
