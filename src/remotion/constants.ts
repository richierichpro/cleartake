// Shared by the composition, the editor and the server export (no React imports here).
export const FPS = 30;

/** Output size: the recording's aspect ratio at 1080p (even dimensions for H.264). */
export function compositionSize(width: number, height: number) {
  const h = 1080;
  const w = Math.round((h * (width / height || 16 / 9)) / 2) * 2;
  return { width: w, height: h };
}
