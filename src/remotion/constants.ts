// Shared by the composition, the editor and the server export (no React imports here).
export const FPS = 30;

export type ExportQuality = "1080p" | "1440p" | "original";
export const EXPORT_QUALITIES: { id: ExportQuality; label: string; hint: string }[] = [
  { id: "1080p", label: "1080p", hint: "Fastest" },
  { id: "1440p", label: "1440p", hint: "Sharp text" },
  { id: "original", label: "Original", hint: "Sharpest, slowest" },
];
export const DEFAULT_QUALITY: ExportQuality = "1440p";

/**
 * Output size: the recording's aspect ratio at the chosen height (even dimensions for H.264).
 * Never upscales beyond the recording. The editor preview uses 1080p.
 */
export function compositionSize(width: number, height: number, quality: ExportQuality = "1080p") {
  const target = quality === "original" ? height : Math.min(height || 1080, quality === "1440p" ? 1440 : 1080);
  const h = Math.round(target / 2) * 2 || 1080;
  const w = Math.round((h * (width / height || 16 / 9)) / 2) * 2;
  return { width: w, height: h };
}

/** Rough render time: ~4.5s per output second at 1728×1080 on an 8-core laptop, scaling with pixel count. */
export const estimateRenderSeconds = (duration: number, size: { width: number; height: number }) =>
  duration * 4.5 * ((size.width * size.height) / (1728 * 1080));
