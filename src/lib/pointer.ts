import { spawn } from "node:child_process";

// Where the mouse pointer was when you clicked. A recording has no click data, but the pointer is drawn
// into it: comparing each frame with the next shows it moving, and the last place it moved to before the
// screen changed is where it rested when you clicked (people hover a moment, then click).

export const POINTER_CONFIG = {
  width: 640, // analysis width; a pointer is ~8×12 px here
  window: 2.5, // seconds before the change to follow the pointer
  fps: 10,
  diff: 40, // gray-level change between frames that counts
  minPx: 6, // smaller blobs are noise
  maxBox: 90, // px: bigger blobs aren't the pointer (a panel opening, a scroll)
  same: 8, // px: blobs this close in consecutive frame pairs are the same spot
};

/** Grayscale frames over [start, end) at POINTER_CONFIG.width. */
function grabFrames(video: string, start: number, end: number, width: number, height: number): Promise<Uint8Array[]> {
  const c = POINTER_CONFIG;
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-t", (end - start).toFixed(3), "-i", video];
    args.push("-vf", `fps=${c.fps},scale=${width}:${height},format=gray`, "-f", "rawvideo", "pipe:1");
    const proc = spawn("ffmpeg", args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffmpeg couldn't read frames"));
      const all = Buffer.concat(chunks);
      const size = width * height;
      const frames: Uint8Array[] = [];
      for (let o = 0; o + size <= all.length; o += size) frames.push(new Uint8Array(all.buffer, all.byteOffset + o, size));
      resolve(frames);
    });
  });
}

type Blob = { x: number; y: number; px: number };

/** Small changed blobs between two frames (pointer-sized). */
function blobsBetween(a: Uint8Array, b: Uint8Array, width: number, height: number): Blob[] {
  const c = POINTER_CONFIG;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) if (Math.abs(a[i] - b[i]) > c.diff) mask[i] = 1;
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    mask[start] = 2;
    stack.push(start);
    let px = 0;
    let sx = 0;
    let sy = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      px++;
      sx += x;
      sy += y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const n of [i - 1, i + 1, i - width, i + width]) {
        if (n >= 0 && n < mask.length && mask[n] === 1 && Math.abs((n % width) - x) <= 1) {
          mask[n] = 2;
          stack.push(n);
        }
      }
    }
    if (px >= c.minPx && x1 - x0 <= c.maxBox && y1 - y0 <= c.maxBox) blobs.push({ x: sx / px, y: sy / px, px });
  }
  return blobs;
}

/**
 * The pointer's position (0–1 of the recording) when you clicked just before `t`, or null if it can't
 * be seen. `near` (0–1): what changed on screen, to break ties (you click close to what changes).
 */
export async function pointerBefore(video: string, t: number, videoWidth: number, videoHeight: number, near?: { x: number; y: number }) {
  const c = POINTER_CONFIG;
  const width = c.width;
  const height = Math.round((width * videoHeight) / videoWidth / 2) * 2;
  const frames = await grabFrames(video, Math.max(0, t - c.window), Math.max(0.05, t - 0.05), width, height).catch(() => []);
  if (frames.length < 3) return null;

  // The last frame pair where something pointer-sized moved: the pointer's last move before the click.
  const moves: Blob[][] = [];
  for (let k = 0; k + 1 < frames.length; k++) moves.push(blobsBetween(frames[k], frames[k + 1], width, height));
  const k = moves.findLastIndex((m) => m.length > 0);
  if (k < 0) return null;

  // In that pair the pointer shows twice: where it left and where it arrived. Where it left was where it
  // arrived in the previous move, so drop blobs that were already there.
  const close = (a: Blob, b: Blob) => Math.hypot(a.x - b.x, a.y - b.y) <= c.same;
  const before = moves[k - 1] ?? [];
  const arrived = moves[k].filter((b) => !before.some((p) => close(b, p)));
  const options = arrived.length ? arrived : moves[k];
  const target = near ? { x: near.x * width, y: near.y * height } : null;
  const pick = options.reduce((best, b) =>
    target
      ? Math.hypot(b.x - target.x, b.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y)
        ? b
        : best
      : b.px > best.px
        ? b
        : best,
  );
  return { x: pick.x / width, y: pick.y / height };
}
