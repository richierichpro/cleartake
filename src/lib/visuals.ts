import type { Project, Visuals } from "./types";

// Step 10: how the recording is framed. Shared by the editor, the composition and the export.

export const BACKGROUND_PRESETS: { id: string; name: string; css: string }[] = [
  {
    id: "aurora",
    name: "Aurora",
    css: "radial-gradient(at 18% 22%, #a5b4fc 0, transparent 55%), radial-gradient(at 82% 28%, #f0abfc 0, transparent 50%), radial-gradient(at 50% 92%, #99f6e4 0, transparent 55%), #eef2ff",
  },
  {
    id: "ember",
    name: "Ember",
    css: "radial-gradient(at 12% 15%, #ff5c35 0, transparent 50%), radial-gradient(at 88% 85%, #ffb199 0, transparent 55%), radial-gradient(at 85% 10%, #ffd6c7 0, transparent 45%), #fff1ec",
  },
  { id: "ocean", name: "Ocean", css: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 45%, #22d3ee 100%)" },
  { id: "peach", name: "Peach", css: "linear-gradient(135deg, #ffe29f 0%, #ffa99f 50%, #ff719a 100%)" },
  { id: "mint", name: "Mint", css: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)" },
  { id: "dusk", name: "Dusk", css: "linear-gradient(160deg, #3b1d60 0%, #7b3fa0 45%, #f6a6b2 100%)" },
  { id: "graphite", name: "Graphite", css: "radial-gradient(at 30% 20%, #3f3f46 0, transparent 60%), linear-gradient(160deg, #18181b 0%, #27272a 100%)" },
  { id: "paper", name: "Paper", css: "linear-gradient(180deg, #f5f5f4 0%, #e7e5e4 100%)" },
];

// Offsets in px at 1080p; the composition scales them with the canvas.
export const SHADOWS = {
  none: null,
  light: { y: 8, blur: 24, alpha: 0.12 },
  medium: { y: 18, blur: 50, alpha: 0.22 },
  strong: { y: 28, blur: 80, alpha: 0.38 },
} as const;
export type ShadowLevel = keyof typeof SHADOWS;

export const DEFAULT_VISUALS: Visuals = {
  background: { enabled: true, preset: "aurora", image: null },
  shadow: "medium",
  radius: 16, // px at 1080p, scaled with the canvas
  padding: 8, // % of the canvas on every side
};

export const RADIUS_MAX = 48;
export const PADDING_MAX = 20;

export const visualsOf = (p: Project): Visuals => ({
  ...DEFAULT_VISUALS,
  ...p.visuals,
  background: { ...DEFAULT_VISUALS.background, ...p.visuals?.background },
});

/** Framed = the recording sits on a 16:9 background canvas. Otherwise the canvas is the recording itself. */
export const isFramed = (v: Visuals) => v.background.enabled;

export const backgroundCss = (v: Visuals) =>
  BACKGROUND_PRESETS.find((b) => b.id === v.background.preset)?.css ?? BACKGROUND_PRESETS[0].css;

/** Everything the composition needs to draw the frame (plain data, safe to pass as inputProps). */
export type FrameProps = {
  framed: boolean;
  background: string; // CSS background (preset)
  image: string | null; // URL of an uploaded background image
  shadow: ShadowLevel;
  radius: number;
  padding: number;
  recordingAspect: number; // width / height of the recording
};

export function frameProps(project: Project, imageUrl: (file: string) => string): FrameProps {
  const v = visualsOf(project);
  return {
    framed: isFramed(v),
    background: backgroundCss(v),
    image: v.background.image ? imageUrl(v.background.image) : null,
    shadow: v.shadow,
    radius: v.radius,
    padding: v.padding,
    recordingAspect: project.video.width / project.video.height || 16 / 9,
  };
}
