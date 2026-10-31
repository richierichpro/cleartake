import { Fragment } from "react";
import { AbsoluteFill, Freeze, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import type { CaptionLine } from "@/lib/captions";
import { OVERLAY_CONFIG, type CalloutOverlay, type Overlays, type StepOverlay } from "@/lib/overlays";
import { musicVolume } from "@/lib/music";
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
  overlays: Omit<Overlays, "placed">; // intro/outro, step badges, callouts, crossfades (Step 15b)
  duration: number; // output seconds of the edited video (without intro/outro)
  music: { src: string; volume: number } | null; // Music tab: one track under everything, ducked under the voice
};

const frames = (seconds: number) => Math.round(seconds * FPS);

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const ACCENT = "#FF5C35";
const INK = "#111113";
const FADE = 8; // frames for scene fades
// Mount scenes this early (hidden), so their videos are loaded when they appear: no blank flash.
const PREMOUNT = 2 * FPS;

export function DemoVideo(props: DemoVideoProps) {
  const { frame, overlays, duration } = props;
  const fly = overlays.intro?.flyIn ? frames(OVERLAY_CONFIG.flyIn) : 0;
  const lead = overlays.intro ? frames(OVERLAY_CONFIG.intro) + fly : 0;
  const main = Math.max(1, frames(duration));
  return (
    <AbsoluteFill style={{ backgroundColor: frame.framed ? "#000" : INK }}>
      {frame.framed &&
        (frame.image ? (
          <Img src={frame.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <AbsoluteFill style={{ background: frame.background }} />
        ))}
      {props.music && <Music music={props.music} voice={props.voice} lead={lead} total={lead + main + (overlays.outro ? frames(OVERLAY_CONFIG.outro) : 0)} />}
      {overlays.intro && (
        <>
          <Sequence durationInFrames={lead - fly} name="Intro">
            <SceneCard big={overlays.intro.title} small={overlays.intro.subtitle} fadeOutAt={lead - fly} />
          </Sequence>
          {fly ? (
            // The video's first frame flies in, tilted, with echoes, and lands flat as the video starts.
            <Sequence from={lead - fly} durationInFrames={fly} name="Fly-in" premountFor={PREMOUNT}>
              <FlyIn {...props} length={fly} />
            </Sequence>
          ) : (
            // The intro card crossfades into the video's first frame.
            <Sequence from={lead - FADE} durationInFrames={FADE} name="Intro → video" premountFor={PREMOUNT}>
              <Fade frames={FADE} from={0} to={1}>
                <Freeze frame={0}>
                  <Main {...props} still />
                </Freeze>
              </Fade>
            </Sequence>
          )}
        </>
      )}
      <Sequence from={lead} durationInFrames={main} name="Video" premountFor={PREMOUNT}>
        <Main {...props} />
      </Sequence>
      {overlays.outro && (
        <>
          {/* The video's last frame fades out under the outro card. */}
          <Sequence from={lead + main} durationInFrames={FADE} name="Video → outro" premountFor={PREMOUNT}>
            <Fade frames={FADE} from={1} to={0}>
              <Freeze frame={main - 1}>
                <Main {...props} still />
              </Freeze>
            </Fade>
          </Sequence>
          <Sequence from={lead + main} name="Outro">
            <SceneCard big={overlays.outro.line} small={overlays.outro.title} />
          </Sequence>
        </>
      )}
    </AbsoluteFill>
  );
}

// The edited video: the framed recording (zoomed), captions, badges and callouts, and the voice.
// `still`: a frozen frame for the scene transitions (no sound). `bare`: only the framed recording.
function Main({
  videoSrc,
  pieces,
  voice,
  muteOriginal,
  frame,
  zooms,
  captions,
  overlays,
  still = false,
  bare = false,
}: DemoVideoProps & { still?: boolean; bare?: boolean }) {
  const { width, height } = useVideoConfig();
  const scale = height / 1080; // sizes are defined at 1080p
  const box = recordingBox(frame, width, height);
  const zoomTransform = useZoomTransform(zooms);
  const radius = frame.framed ? frame.radius * scale : 0;
  const shadow = frame.framed ? SHADOWS[frame.shadow] : null;

  return (
    <AbsoluteFill>
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
            <Recording pieces={pieces} videoSrc={videoSrc} muteOriginal={muteOriginal || still} crossfades={overlays.crossfades} />
          </div>
        </div>
      </div>
      {!bare && (
        <>
          <Captions lines={captions} />
          {overlays.steps.map((s) => (
            <StepBadge key={s.id} step={s} />
          ))}
          {overlays.callouts.map((c) => (
            <Callout key={c.id} callout={c} left={box.left} raised={captions.length > 0} />
          ))}
        </>
      )}
      {!still &&
        voice.map((v) => (
        <Sequence key={`${v.src}@${v.outputStart}`} from={frames(v.outputStart)} durationInFrames={frames(v.duration) + 1} layout="none">
          <Audio src={v.src} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

// Zoom: spring in at the start, hold, snap back to the full screen at the end. Zooms are ≥ 3s apart, so they never overlap.
function useZoomTransform(zooms: OutputZoom[]) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const z = zooms.find((zoom) => t >= zoom.start && t < zoom.end + ZOOM_LIMITS.easeOut);
  if (!z) return undefined;
  const ease = (seconds: number) => ({ fps, config: { damping: 200 }, durationInFrames: Math.max(1, Math.round(seconds * fps)) });
  const zoomIn = spring({ frame: frame - Math.round(z.start * fps), ...ease(ZOOM_LIMITS.ease) });
  const zoomOut = spring({ frame: frame - Math.round(z.end * fps), ...ease(ZOOM_LIMITS.easeOut) });
  const p = Math.max(0, Math.min(1, zoomIn - zoomOut));
  const scale = 1 + (z.scale - 1) * p;
  const win = zoomWindow(z.x, z.y, scale);
  return `scale(${scale}) translate(${-win.left * 100}%, ${-win.top * 100}%)`;
}

/** 0 → 1 → 0 over an overlay's life: spring in at the start, fade out at the end. */
function useInOut(start: number, end: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start || t >= end) return 0;
  const enter = spring({ frame: frame - Math.round(start * fps), fps, config: { damping: 200 }, durationInFrames: frames(OVERLAY_CONFIG.animIn) });
  const exit = interpolate(t, [end - OVERLAY_CONFIG.animOut, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(enter, exit);
}

// Captions sit above the zoom (they never zoom with the video). The word being spoken gets an orange
// background; words the director emphasized are orange.
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
          fontFamily: FONT,
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
            <span
              style={
                i === current
                  ? // Padding with equal negative margin: the highlight never shifts the words.
                    { background: ACCENT, color: "#fff", borderRadius: 8 * s, padding: `0 ${6 * s}px`, margin: `0 ${-6 * s}px` }
                  : w.emphasis
                    ? { color: ACCENT }
                    : undefined
              }
            >
              {w.text}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Step badge: top left, slides in where a new task begins.
function StepBadge({ step }: { step: StepOverlay }) {
  const { height } = useVideoConfig();
  const p = useInOut(step.start, step.end);
  if (!p) return null;
  const s = height / 1080;
  return (
    <div
      style={{
        position: "absolute",
        left: 40 * s,
        top: 40 * s,
        display: "flex",
        alignItems: "center",
        gap: 14 * s,
        padding: `${10 * s}px ${22 * s}px ${10 * s}px ${10 * s}px`,
        borderRadius: 999,
        background: "rgba(255,255,255,0.96)",
        boxShadow: `0 ${8 * s}px ${28 * s}px rgba(17,17,19,0.18)`,
        fontFamily: FONT,
        opacity: p,
        transform: `translateX(${(1 - p) * -24 * s}px)`,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40 * s,
          height: 40 * s,
          borderRadius: 999,
          background: ACCENT,
          color: "#fff",
          fontSize: 22 * s,
          fontWeight: 700,
        }}
      >
        {step.index}
      </span>
      <span style={{ color: INK, fontSize: 28 * s, fontWeight: 600, letterSpacing: "-0.01em" }}>{step.label}</span>
    </div>
  );
}

// Callout: a lower third at the bottom left, above the captions.
function Callout({ callout, left, raised }: { callout: CalloutOverlay; left: number; raised: boolean }) {
  const { height } = useVideoConfig();
  const p = useInOut(callout.start, callout.end);
  if (!p) return null;
  const s = height / 1080;
  return (
    <div
      style={{
        position: "absolute",
        left: Math.max(40 * s, left + 32 * s),
        bottom: (raised ? 170 : 64) * s,
        display: "flex",
        alignItems: "stretch",
        gap: 16 * s,
        padding: `${16 * s}px ${26 * s}px ${16 * s}px ${16 * s}px`,
        borderRadius: 16 * s,
        background: "rgba(255,255,255,0.97)",
        boxShadow: `0 ${10 * s}px ${32 * s}px rgba(17,17,19,0.2)`,
        fontFamily: FONT,
        opacity: p,
        transform: `translateY(${(1 - p) * 16 * s}px)`,
      }}
    >
      <span style={{ width: 6 * s, borderRadius: 3 * s, background: ACCENT }} />
      <span style={{ color: INK, fontSize: 32 * s, fontWeight: 600, letterSpacing: "-0.01em" }}>{callout.text}</span>
    </div>
  );
}

// Background music under everything: fades in and out, and dips while the AI voice speaks.
function Music({
  music,
  voice,
  lead,
  total,
}: {
  music: NonNullable<DemoVideoProps["music"]>;
  voice: DemoVideoProps["voice"];
  lead: number;
  total: number;
}) {
  const { fps } = useVideoConfig();
  const spoken = voice.map((v) => ({ start: lead + frames(v.outputStart), end: lead + frames(v.outputStart + v.duration) }));
  return <Audio src={music.src} volume={(f) => musicVolume(f, fps, music.volume, spoken, total)} />;
}

// Fly-in (end of the intro): the video's first frame comes up from below, tilted back in 3D, with three
// fading echoes trailing behind, and lands flat just as the video starts. All layers are frozen frames.
function FlyIn({ length, ...props }: DemoVideoProps & { length: number }) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = height / 1080;
  const appear = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ perspective: 1400 * s, perspectiveOrigin: "50% 100%" }}>
      {[3, 2, 1, 0].map((k) => {
        // Echo k lags k × 3 frames, so the copies cascade and then merge into the video.
        const p = spring({ frame: frame - k * 3, fps, config: { damping: 200 }, durationInFrames: length - 10 });
        const echo = k > 0;
        return (
          <AbsoluteFill
            key={k}
            style={{
              transformOrigin: "50% 100%",
              transform: `translateY(${(1 - p) * (32 + k * 9)}%) rotateX(${(1 - p) * 38}deg) scale(${0.86 + 0.14 * p})`,
              opacity: echo ? appear * 0.45 * (1 - p) : appear,
              filter: echo ? `blur(${(1 - p) * 3 * s}px)` : undefined,
            }}
          >
            <Freeze frame={0}>
              <Main {...props} still bare />
            </Freeze>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}

// Intro / outro: a white title card on the background.
function SceneCard({ big, small, fadeOutAt }: { big: string; small: string; fadeOutAt?: number }) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = height / 1080;
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  const sub = spring({ frame: frame - 5, fps, config: { damping: 200 }, durationInFrames: 14 });
  const exit = fadeOutAt ? interpolate(frame, [fadeOutAt - FADE, fadeOutAt], [1, 0], { extrapolateLeft: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exit }}>
      <div
        style={{
          maxWidth: "70%",
          padding: `${56 * s}px ${80 * s}px`,
          borderRadius: 32 * s,
          background: "rgba(255,255,255,0.97)",
          boxShadow: `0 ${24 * s}px ${70 * s}px rgba(17,17,19,0.25)`,
          textAlign: "center",
          fontFamily: FONT,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 20 * s}px) scale(${0.97 + 0.03 * enter})`,
        }}
      >
        <div style={{ width: 56 * s, height: 6 * s, borderRadius: 3 * s, background: ACCENT, margin: `0 auto ${28 * s}px` }} />
        <div style={{ color: INK, fontSize: 68 * s, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.025em" }}>{big}</div>
        {small && (
          <div style={{ color: "#6B6B76", fontSize: 30 * s, marginTop: 18 * s, lineHeight: 1.35, opacity: sub }}>{small}</div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// The edited recording: plan pieces with their speed, plus held frames. At a cut the next piece
// fades in over the previous one, which keeps playing a moment longer underneath.
function Recording({
  pieces,
  videoSrc,
  muteOriginal,
  crossfades,
}: Pick<DemoVideoProps, "pieces" | "videoSrc" | "muteOriginal"> & { crossfades: number[] }) {
  const xf = frames(OVERLAY_CONFIG.crossfade);
  return (
    <>
      {pieces.map((p, i) => {
        const from = frames(p.outputStart);
        const movingEnd = frames(p.outputStart + (p.sourceEnd - p.sourceStart) / p.speed);
        const end = frames(p.outputStart + pieceLength(p));
        const fadeIn = crossfades.includes(i) ? xf : 0;
        const overlap = crossfades.includes(i + 1) ? xf : 0; // the last part of this piece plays under the next one
        return (
          <Fragment key={i}>
            {movingEnd > from && (
              <Sequence from={from} durationInFrames={movingEnd - from + (end > movingEnd ? 0 : overlap)} premountFor={FPS}>
                <FadeIn frames={fadeIn}>
                  <Video
                    src={videoSrc}
                    trimBefore={frames(p.sourceStart)}
                    playbackRate={p.speed}
                    // Fast-forwarded silences would only chirp; mute them.
                    muted={muteOriginal || p.speed > 2}
                    style={{ width: "100%", height: "100%" }}
                    objectFit="contain"
                  />
                </FadeIn>
              </Sequence>
            )}
            {end > movingEnd && (
              <Sequence from={movingEnd} durationInFrames={end - movingEnd + overlap} premountFor={FPS}>
                <FadeIn frames={movingEnd > from ? 0 : fadeIn}>
                  <Freeze frame={0}>
                    <Video
                      src={videoSrc}
                      trimBefore={Math.max(0, frames(p.sourceEnd) - 1)}
                      muted
                      style={{ width: "100%", height: "100%" }}
                      objectFit="contain"
                    />
                  </Freeze>
                </FadeIn>
              </Sequence>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function Fade({ frames: n, from, to, children }: { frames: number; from: number; to: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(frame, [0, n], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{children}</AbsoluteFill>;
}

function FadeIn({ frames: n, children }: { frames: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = n ? interpolate(frame, [0, n], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}
