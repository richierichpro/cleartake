import { spawn } from "node:child_process";

// Clicks, found from the mouse pointer. A recording has no click data, but the pointer is drawn into it:
// comparing each frame with the next shows it moving. A click is the pointer coming to rest and then the
// screen changing: a button press, a menu or panel opening, a whole new page. Changes that come without
// the pointer moving first (a page still loading, an animation) and scrolls (the page sliding) aren't clicks.

export const POINTER_CONFIG = {
  width: 640, // analysis width; a pointer is ~8×12 px here
  fps: 10,
  diff: 40, // gray-level change between frames that counts (subtle hover highlights stay below it)
  minPx: 6, // smaller blobs are noise
  pointerBox: 24, // px: changed blobs up to this size can be the pointer; bigger ones are the screen changing
  window: 2.5, // seconds before a change to look for the pointer
  same: 8, // px: blobs this close in consecutive frame pairs are the same spot
  minChange: 0.002, // share of the screen (besides the pointer) that must change: a click shows a result
  quiet: 0.6, // seconds: changes closer than this are one event (a panel animating open)
  scrollShift: 80, // px: a change that shifting its part of the frame up or down by up to this explains…
  scrollMatch: 0.5, // …this much better than not shifting is a scroll (the page or a sidebar)
  endIgnore: 1.5, // seconds: changes this close to the end are you stopping the recording
  minThickness: 6, // px: thinner changes (a scrollbar, a browser's link preview) aren't click results
  pointerBlobs: 3, // a frame pair with more small blobs than this is content changing, not the pointer moving
  recent: 10, // frame pairs each side: a spot that blinks in ≥ `blinks` other quiet pairs this close is
  blinks: 2, // animating in place (a spinner, a tab's loading icon), not the pointer arriving
  quietBlobs: 10, // a pair with at most this many blobs is quiet (when content changes, letters are blobs)
  minMove: 20, // px: right after a click (within nudgeTime), the pointer must move this far for a new one
  nudgeTime: 1.5,
  clickLead: 0.5, // seconds: the click is at most this long before the screen changes (or when the pointer stopped)
};

type Blob = { x: number; y: number; px: number; tip: { x: number; y: number } };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** One frame pair: the pointer-sized blobs (where it left and arrived), and how much of the screen changed. */
interface Pair {
  t: number; // seconds, the second frame of the pair
  blobs: Blob[];
  change: number; // share of the screen in bigger blobs
  box: Box | null; // where it changed
  scroll: boolean;
}

export interface Click {
  time: number; // source seconds: when you clicked (the pointer at rest, at most clickLead before the change)
  changeAt: number; // when the screen changed
  x: number; // pointer position, 0–1 of the recording
  y: number;
  change: Box; // what changed, 0–1
}

/** Changed blobs between two frames, split into pointer-sized ones and the rest. */
function compare(a: Uint8Array, b: Uint8Array, width: number, height: number) {
  const c = POINTER_CONFIG;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) if (Math.abs(a[i] - b[i]) > c.diff) mask[i] = 1;
  const blobs: Blob[] = [];
  let changed = 0;
  let box: Box | null = null;
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
    if (px < c.minPx) continue;
    if (x1 - x0 <= c.pointerBox && y1 - y0 <= c.pointerBox) {
      // You click with the pointer's tip: the top of the arrow, a bit left of the middle for a hand.
      blobs.push({ x: sx / px, y: sy / px, px, tip: { x: x0 + (x1 - x0) * 0.3, y: y0 + (y1 - y0) * 0.1 } });
    } else {
      changed += px;
      box = box
        ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) }
        : { x0, y0, x1, y1 };
    }
  }
  return { blobs, change: changed / mask.length, box };
}

/** True if, inside the box, b is mostly a vertically shifted a (the page or a sidebar scrolled). Sampled. */
function isScroll(a: Uint8Array, b: Uint8Array, width: number, height: number, box: Box) {
  const c = POINTER_CONFIG;
  const m = c.scrollShift;
  const y0 = Math.max(m, box.y0);
  const y1 = Math.min(height - m, box.y1 + 1);
  if (y1 - y0 < 6) return false;
  const diffAt = (dy: number) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 3) {
      for (let x = box.x0; x <= box.x1; x += 3) {
        sum += Math.abs(a[(y + dy) * width + x] - b[y * width + x]);
        n++;
      }
    }
    return sum / n;
  };
  const still = diffAt(0);
  let best = still;
  for (let dy = -m; dy <= m; dy += 2) if (dy) best = Math.min(best, diffAt(dy));
  return best < still * c.scrollMatch;
}

/** Streams the recording through ffmpeg (grayscale, POINTER_CONFIG.width) and compares each frame with the last. */
export function scan(video: string, width: number, height: number): Promise<Pair[]> {
  const c = POINTER_CONFIG;
  const size = width * height;
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", video];
    args.push("-vf", `fps=${c.fps},scale=${width}:${height},format=gray`, "-f", "rawvideo", "pipe:1");
    const proc = spawn("ffmpeg", args);
    const pairs: Pair[] = [];
    let prev: Uint8Array | null = null;
    let pending = Buffer.alloc(0);
    let index = 0;
    proc.stdout.on("data", (d: Buffer) => {
      pending = Buffer.concat([pending, d]);
      while (pending.length >= size) {
        const frame = new Uint8Array(pending.subarray(0, size));
        pending = pending.subarray(size);
        if (prev) {
          const r = compare(prev, frame, width, height);
          const scroll = r.change > c.minChange && !!r.box && isScroll(prev, frame, width, height, r.box);
          pairs.push({ t: index / c.fps, ...r, scroll });
        }
        prev = frame;
        index++;
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(pairs) : reject(new Error("ffmpeg couldn't read frames"))));
  });
}

/** Every click in the recording, in order. */
export async function detectClicks(video: string, videoWidth: number, videoHeight: number): Promise<Click[]> {
  const c = POINTER_CONFIG;
  const width = c.width;
  const height = Math.round((width * videoHeight) / videoWidth / 2) * 2;
  const pairs = await scan(video, width, height);
  const duration = pairs.length / c.fps;

  // Where the pointer arrived, per frame pair. Only pairs where little else changed count (when text
  // changes, every letter is a pointer-sized blob). The pointer shows twice in a pair (where it left,
  // where it arrived); where it left is where it was in the pair before. A spot that keeps blinking
  // (a spinner, a tab's loading icon) is animating in place; the pointer arrives at a spot once, and
  // shows there again at most when it leaves.
  const close = (a: Blob, b: Blob) => Math.hypot(a.x - b.x, a.y - b.y) <= c.same;
  const quiet = (p: Pair) => p.change < c.minChange && p.blobs.length <= c.quietBlobs;
  const blinking = (b: Blob, k: number) =>
    pairs.filter((q, j) => Math.abs(j - k) > 1 && Math.abs(j - k) <= c.recent && quiet(q) && q.blobs.some((x) => close(b, x))).length >= c.blinks;
  const arrivals = pairs.map((p, k) => {
    if (!quiet(p) || p.blobs.length > c.pointerBlobs) return [];
    const left = pairs[k - 1]?.blobs ?? [];
    const moved = p.blobs.length > 1 ? p.blobs.filter((b) => !left.some((q) => close(b, q))) : p.blobs;
    return moved.filter((b) => !blinking(b, k));
  });

  // Screen changes: runs of changed frame pairs, merged when close together (unless the pointer moved in
  // between: that's a second click). Hair-thin changes (a scrollbar showing, the link preview at the
  // bottom of a browser) don't count. An event that is mostly sliding content is a scroll; one that is
  // mostly not is a click result (opening a panel can nudge a sidebar, which looks like a small scroll).
  const thin = (b: Box) => b.x1 - b.x0 < c.minThickness || b.y1 - b.y0 < c.minThickness;
  const events: { first: number; last: number; box: Box | null; scrolled: number; changed: number }[] = [];
  pairs.forEach((p, k) => {
    if (p.change < c.minChange || !p.box || thin(p.box) || p.t > duration - c.endIgnore) return;
    let e = events.at(-1);
    const movedSince = e && arrivals.slice(e.last + 1, k).some((a) => a.length);
    if (!e || p.t - pairs[e.last].t >= c.quiet || movedSince) events.push((e = { first: k, last: k, box: null, scrolled: 0, changed: 0 }));
    e.last = k;
    if (p.scroll) e.scrolled += p.change;
    else {
      e.changed += p.change;
      e.box ??= p.box;
    }
  });

  const clicks: Click[] = [];
  let since = 0; // the pointer must move after the previous change for the next one to be a click
  let last: { at: Blob; t: number } | null = null; // the previous click
  for (const e of events) {
    const from = Math.max(since, e.first - Math.round(c.window * c.fps));
    since = e.last + 1;
    if (!e.box || e.scrolled >= e.changed) continue;
    // The last pair before the change where the pointer moved: where it arrived is where you clicked.
    let k = e.first - 1;
    while (k >= from && !arrivals[k].length) k--;
    if (k < from) continue; // the pointer didn't move: a page still loading, an animation
    // Ties: you click close to what changes.
    const box = e.box;
    const near = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    const dist = (b: Blob) => Math.hypot(b.x - near.x, b.y - near.y);
    const pick = arrivals[k].reduce((best, b) => (dist(b) < dist(best) ? b : best));
    const nudge = last && pairs[k].t - last.t < c.nudgeTime && Math.hypot(pick.x - last.at.x, pick.y - last.at.y) < c.minMove;
    if (nudge) continue; // the pointer settling after the last click, not a new one
    last = { at: pick, t: pairs[k].t };
    const changeAt = pairs[e.first].t;
    clicks.push({
      time: Math.max(pairs[k].t, changeAt - c.clickLead),
      changeAt,
      x: pick.tip.x / width,
      y: pick.tip.y / height,
      change: { x0: box.x0 / width, y0: box.y0 / height, x1: (box.x1 + 1) / width, y1: (box.y1 + 1) / height },
    });
  }
  return clicks;
}
