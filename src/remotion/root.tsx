import { Composition, type CalculateMetadataFunction } from "remotion";
import { FPS } from "./constants";
import { DemoVideo, type DemoVideoProps } from "./demo-video";

// Used only for server rendering (Step 8). Size and length come from the input props,
// so the export matches the editor's Player exactly.
export type RenderProps = DemoVideoProps & { width: number; height: number; durationInFrames: number };

const RenderedVideo = (props: RenderProps) => <DemoVideo {...props} />;

const calculateMetadata: CalculateMetadataFunction<RenderProps> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  width: props.width,
  height: props.height,
});

export function RemotionRoot() {
  return (
    <Composition
      id="DemoVideo"
      component={RenderedVideo}
      fps={FPS}
      calculateMetadata={calculateMetadata}
      defaultProps={{ videoSrc: "", pieces: [], voice: [], muteOriginal: true, width: 1920, height: 1080, durationInFrames: 1 }}
    />
  );
}
