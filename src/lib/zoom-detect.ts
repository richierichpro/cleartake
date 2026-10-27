// Step 12: find where the screen changes, as zoom candidates. Pure; runs on the 5 fps grayscale
// frames saved in Step 6 (frames.gray). All thresholds in one place.

export const ZOOM_DETECT_CONFIG = {
  pixelThreshold: 12, // gray-level change that counts (same as motion scoring)
  cell: 8, // grid cell size in sampled-frame pixels (160px wide → 20 columns)
  cellActive: 0.12, // a cell is "changed" when this share of its pixels changed
  minChangedPx: 48, // ignore frames with fewer changed pixels in a region (cursor moves, blinking caret)
  minCells: 2, // and regions smaller than this many cells
  maxCoverage: 0.35, // a frame where more than this share of the screen changed = scroll / page load
  persistentWindow: 3, // seconds each side…
  persistentShare: 0.6, // …a cell changing in more than this share of frames = spinner / video, ignored
  mergeGap: 0.6, // changes this close in time and touching in space form one event
  maxBoxShare: 0.4, // events bigger than this share of the screen aren't zoom-worthy
  minEventPx: 150, // events with fewer changed pixels in total are too faint (hover flickers, cursor)
  padCells: 1, // grow each box a little so the zoom has context
};
export type ZoomDetectConfig = typeof ZOOM_DETECT_CONFIG;

export interface ZoomCandidate {
  id: string;
  start: number; // source seconds
  end: number;
  x: number; // box, normalized 0–1 of the recording
  y: number;
  w: number;
  h: number;
  changedPx: number; // total changed pixels in the event (strength)
}

export interface ZoomDetection {
  candidates: ZoomCandidate[];
  skipped: { fullScreenFrames: number; persistentCells: number; tooBig: number; tooSmall: number; tooFaint: number };
  config: ZoomDetectConfig;
}

type Box = { c0: number; r0: number; c1: number; r1: number }; // inclusive cell coords

const touches = (a: Box, b: Box, gap = 1) =>
  a.c0 <= b.c1 + gap && b.c0 <= a.c1 + gap && a.r0 <= b.r1 + gap && b.r0 <= a.r1 + gap;
const union = (a: Box, b: Box): Box => ({
  c0: Math.min(a.c0, b.c0),
  r0: Math.min(a.r0, b.r0),
  c1: Math.max(a.c1, b.c1),
  r1: Math.max(a.r1, b.r1),
});

export function detectZoomCandidates(
  frames: Uint8Array,
  meta: { fps: number; width: number; height: number; frames: number },
  c: ZoomDetectConfig = ZOOM_DETECT_CONFIG,
): ZoomDetection {
  const { fps, width: W, height: H } = meta;
  const n = meta.frames;
  const size = W * H;
  const cols = Math.ceil(W / c.cell);
  const rows = Math.ceil(H / c.cell);
  const cells = cols * rows;
  const skipped = { fullScreenFrames: 0, persistentCells: 0, tooBig: 0, tooSmall: 0, tooFaint: 0 };

  // 1. Per frame: which cells changed (and how many pixels), skipping full-screen changes.
  const active: Uint8Array[] = [];
  const counts: Uint16Array[] = [];
  for (let f = 0; f < n; f++) {
    const act = new Uint8Array(cells);
    const cnt = new Uint16Array(cells);
    if (f > 0) {
      let changed = 0;
      const a = (f - 1) * size;
      const b = f * size;
      for (let y = 0; y < H; y++) {
        const row = Math.floor(y / c.cell) * cols;
        for (let x = 0; x < W; x++) {
          if (Math.abs(frames[a + y * W + x] - frames[b + y * W + x]) > c.pixelThreshold) {
            cnt[row + Math.floor(x / c.cell)]++;
            changed++;
          }
        }
      }
      if (changed / size > c.maxCoverage) {
        skipped.fullScreenFrames++;
        cnt.fill(0);
      } else {
        for (let i = 0; i < cells; i++) act[i] = cnt[i] >= c.cellActive * c.cell * c.cell ? 1 : 0;
      }
    }
    active.push(act);
    counts.push(cnt);
  }

  // 2. Spinners / embedded videos: cells that keep changing in a sliding window.
  const win = Math.round(c.persistentWindow * fps);
  const persistentSeen = new Uint8Array(cells);
  const running = new Uint16Array(cells);
  for (let f = 0; f < Math.min(n, win); f++) for (let i = 0; i < cells; i++) running[i] += active[f][i];
  const keep: Uint8Array[] = [];
  for (let f = 0; f < n; f++) {
    if (f + win < n) for (let i = 0; i < cells; i++) running[i] += active[f + win][i];
    if (f - win - 1 >= 0) for (let i = 0; i < cells; i++) running[i] -= active[f - win - 1][i];
    const span = Math.min(n - 1, f + win) - Math.max(0, f - win) + 1;
    const k = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) {
      if (!active[f][i]) continue;
      if (running[i] / span > c.persistentShare) persistentSeen[i] = 1;
      else k[i] = 1;
    }
    keep.push(k);
  }
  skipped.persistentCells = persistentSeen.reduce((s, v) => s + v, 0);

  // 3. Per frame: connected changed regions → boxes.
  const frameBoxes: { box: Box; px: number }[][] = keep.map((k, f) => {
    const seen = new Uint8Array(cells);
    const boxes: { box: Box; px: number }[] = [];
    for (let i = 0; i < cells; i++) {
      if (!k[i] || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      const box: Box = { c0: i % cols, r0: Math.floor(i / cols), c1: i % cols, r1: Math.floor(i / cols) };
      let px = 0;
      let num = 0;
      while (stack.length) {
        const j = stack.pop()!;
        const cx = j % cols;
        const cy = Math.floor(j / cols);
        px += counts[f][j];
        num++;
        Object.assign(box, union(box, { c0: cx, r0: cy, c1: cx, r1: cy }));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nj = ny * cols + nx;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && k[nj] && !seen[nj]) {
            seen[nj] = 1;
            stack.push(nj);
          }
        }
      }
      if (num < c.minCells || px < c.minChangedPx) skipped.tooSmall++;
      else boxes.push({ box, px });
    }
    return boxes;
  });

  // 4. Group boxes that touch and are close in time into events.
  const gap = Math.round(c.mergeGap * fps);
  type Event = { box: Box; first: number; last: number; px: number };
  const open: Event[] = [];
  const done: Event[] = [];
  frameBoxes.forEach((boxes, f) => {
    for (const { box, px } of boxes) {
      const e = open.find((o) => f - o.last <= gap && touches(o.box, box));
      if (e) {
        e.box = union(e.box, box);
        e.last = f;
        e.px += px;
      } else open.push({ box, first: f, last: f, px });
    }
    for (let i = open.length - 1; i >= 0; i--) if (f - open[i].last > gap) done.push(...open.splice(i, 1));
  });
  done.push(...open);

  // 5. Normalize, pad, and drop events that are too big to be worth a zoom.
  const candidates: ZoomCandidate[] = [];
  for (const e of done.sort((a, b) => a.first - b.first)) {
    const b = {
      c0: Math.max(0, e.box.c0 - c.padCells),
      r0: Math.max(0, e.box.r0 - c.padCells),
      c1: Math.min(cols - 1, e.box.c1 + c.padCells),
      r1: Math.min(rows - 1, e.box.r1 + c.padCells),
    };
    const x = (b.c0 * c.cell) / W;
    const y = (b.r0 * c.cell) / H;
    const w = Math.min(1 - x, ((b.c1 - b.c0 + 1) * c.cell) / W);
    const h = Math.min(1 - y, ((b.r1 - b.r0 + 1) * c.cell) / H);
    if (w * h > c.maxBoxShare) {
      skipped.tooBig++;
      continue;
    }
    if (e.px < c.minEventPx) {
      skipped.tooFaint++;
      continue;
    }
    candidates.push({
      id: `z${e.first}`,
      start: e.first / fps,
      end: (e.last + 1) / fps,
      x,
      y,
      w,
      h,
      changedPx: e.px,
    });
  }
  return { candidates, skipped, config: c };
}
