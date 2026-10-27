import { Fragment } from "react";
import { AbsoluteFill, Freeze, Sequence } from "remotion";
import { Audio, Video } from "@remotion/media";
import { pieceLength, type TimelinePiece } from "@/lib/sync";
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
};

const frames = (seconds: number) => Math.round(seconds * FPS);

export function DemoVideo({ videoSrc, pieces, voice, muteOriginal }: DemoVideoProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
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
      {voice.map((v) => (
        <Sequence key={`${v.src}@${v.outputStart}`} from={frames(v.outputStart)} durationInFrames={frames(v.duration) + 1} layout="none">
          <Audio src={v.src} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
