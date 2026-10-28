import { Fragment } from "react";
import { AbsoluteFill, Freeze, Img, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import type { CaptionLine } from "@/lib/captions";
import { pieceLength, type TimelinePiece } from "@/lib/sync";
import { recordingBox, SHADOWS, type FrameProps } from "@/lib/visuals";
import { ZOOM_LIMITS, zoomWindow, type OutputZoom } from "@/lib/zooms";
import { FPS } from "./constants";

// The one composition used for both the editor preview (Remotion Player) and the export (Step 8).
// It only renders what it's given: no decisions are made here.

export { FPS, compositionSize } from "./constants";

// A type alias (not an interface) so it satisfies Remotion's Record<string, unknown> props constraint.
export type DemoVideoProps = {
  videoSrc: string;
  pieces: TimelinePiece[]; // from the sync plan, in output order
  voice: { src: string; outputStart: number; duration: number }[];
  muteOriginal: boolean; // true in AI voice mode
  frame: FrameProps; // background, padding, corners, shadow (Step 10)
  zooms: OutputZoom[]; // output seconds (Step 13)
  captions: CaptionLine[]; // output seconds, empty when captions are off (Step 14)
};

const frames = (seconds: number) => Math.round(seconds * FPS);

export function DemoVideo({ videoSrc, pieces, voice, muteOriginal, frame, zooms, captions }: DemoVideoProps) {
  const { width, height } = useVideoConfig();
  const scale = height / 1080; // sizes are defined at 1080p

  const box = recordingBox(frame, width, height);
  const zoomTransform = useZoomTransform(zooms);
  const radius = frame.framed ? frame.radius * scale : 0;
  const shadow = frame.framed ? SHADOWS[frame.shadow] : null;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {frame.framed &&
        (frame.image ? (
          <Img src={frame.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <AbsoluteFill style={{ background: frame.background }} />
        ))}
      <div
        style={{
          position: "absolute",
          ...box,
          borderRadius: radius,
          boxShadow: shadow ? `0 ${shadow.y * scale}px ${shadow.blur * scale}px rgba(0,0,0,${shadow.alpha})` : undefined,
        }}
      >
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, background: "#000" }}>
          <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: zoomTransform }}>
            <Recording pieces={pieces} videoSrc={videoSrc} muteOriginal={muteOriginal} />
          </div>
        </div>
      </div>
      <Captions lines={captions} />
      {voice.map((v) => (
        <Sequence key={`${v.src}@${v.outputStart}`} from={frames(v.outputStart)} durationInFrames={frames(v.duration) + 1} layout="none">
          <Audio src={v.src} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

// Zoom: spring in at the start, hold, spring back out after the end. Zooms are ≥ 3s apart, so they never overlap.
function useZoomTransform(zooms: OutputZoom[]) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const z = zooms.find((zoom) => t >= zoom.start && t < zoom.end + ZOOM_LIMITS.ease);
  if (!z) return undefined;
  const ease = { fps, config: { damping: 200 }, durationInFrames: Math.round(ZOOM_LIMITS.ease * fps) };
  const zoomIn = spring({ frame: frame - Math.round(z.start * fps), ...ease });
  const zoomOut = spring({ frame: frame - Math.round(z.end * fps), ...ease });
  const p = Math.max(0, Math.min(1, zoomIn - zoomOut));
  const scale = 1 + (z.scale - 1) * p;
  const win = zoomWindow(z.x, z.y, scale);
  return `scale(${scale}) translate(${-win.left * 100}%, ${-win.top * 100}%)`;
}

const CAPTION_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const CAPTION_HIGHLIGHT = "#FF5C35";

// Captions sit above the zoom (they never zoom with the video). The word being spoken is highlighted.
function Captions({ lines }: { lines: CaptionLine[] }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const line = lines.find((l) => t >= l.start && t < l.end);
  if (!line) return null;
  const s = height / 1080;
  const appear = spring({ frame: frame - Math.round(line.start * fps), fps, config: { damping: 200 }, durationInFrames: 6 });
  const current = line.words.findLastIndex((w) => w.start <= t);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64 * s, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: width * 0.8,
          padding: `${12 * s}px ${26 * s}px`,
          borderRadius: 16 * s,
          background: "rgba(17,17,19,0.82)",
          color: "#fff",
          fontFamily: CAPTION_FONT,
          fontSize: 44 * s,
          fontWeight: 600,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
          textAlign: "center",
          opacity: appear,
          transform: `translateY(${(1 - appear) * 10 * s}px)`,
        }}
      >
        {line.words.map((w, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            <span style={{ color: i === current ? CAPTION_HIGHLIGHT : undefined }}>{w.text}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// The edited recording: plan pieces with their speed, plus held frames.
function Recording({ pieces, videoSrc, muteOriginal }: Pick<DemoVideoProps, "pieces" | "videoSrc" | "muteOriginal">) {
  return (
    <>
      {pieces.map((p, i) => {
        const from = frames(p.outputStart);
        const movingEnd = frames(p.outputStart + (p.sourceEnd - p.sourceStart) / p.speed);
        const end = frames(p.outputStart + pieceLength(p));
        return (
          <Fragment key={i}>
            {movingEnd > from && (
              <Sequence from={from} durationInFrames={movingEnd - from} premountFor={FPS}>
                <Video
                  src={videoSrc}
                  trimBefore={frames(p.sourceStart)}
                  playbackRate={p.speed}
                  // Fast-forwarded silences would only chirp; mute them.
                  muted={muteOriginal || p.speed > 2}
                  style={{ width: "100%", height: "100%" }}
                  objectFit="contain"
                />
              </Sequence>
            )}
            {end > movingEnd && (
              <Sequence from={movingEnd} durationInFrames={end - movingEnd} premountFor={FPS}>
                <Freeze frame={0}>
                  <Video
                    src={videoSrc}
                    trimBefore={Math.max(0, frames(p.sourceEnd) - 1)}
                    muted
                    style={{ width: "100%", height: "100%" }}
                    objectFit="contain"
                  />
                </Freeze>
              </Sequence>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
