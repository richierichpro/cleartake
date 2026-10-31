import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts/ocr.swift");
const BINARY = path.join(process.cwd(), ".cache/ocr");

export interface OcrItem {
  text: string;
  x: number; // normalized 0–1, top-left origin
  y: number;
  w: number;
  h: number;
  conf: number;
}

/** Compiles scripts/ocr.swift once (macOS only) and reuses the binary until the script changes. */
async function ensureBinary() {
  const [bin, src] = await Promise.all([fs.stat(BINARY).catch(() => null), fs.stat(SCRIPT)]);
  if (bin && bin.mtimeMs >= src.mtimeMs) return;
  await fs.mkdir(path.dirname(BINARY), { recursive: true });
  try {
    await run("swiftc", ["-O", SCRIPT, "-o", BINARY], { timeout: 180_000 });
  } catch (err) {
    throw new Error(`Couldn't build the OCR helper (needs macOS with Xcode command line tools): ${(err as Error).message}`);
  }
}

/** Which reader: macOS's Vision framework (best on UI text), else Tesseract (a Linux server). OCR_ENGINE overrides. */
const ENGINE = process.env.OCR_ENGINE ?? (process.platform === "darwin" ? "vision" : "tesseract");

/** Grabs full-resolution frames at the given source times and reads the text on them, line by line. */
export async function ocrFrames(video: string, times: number[]): Promise<OcrItem[][]> {
  if (!times.length) return [];
  if (ENGINE === "vision") await ensureBinary();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cleartake-ocr-"));
  try {
    const files: string[] = [];
    for (const [i, t] of times.entries()) {
      const file = path.join(dir, `f${i}.jpg`);
      // Tesseract reads small UI text better when it's bigger: double frames under 2000px wide.
      const scale = ENGINE === "tesseract" ? ["-vf", "scale='if(lt(iw,2000),iw*2,iw)':-2"] : [];
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(3), "-i", video, ...scale, "-frames:v", "1", "-q:v", "2", "-y", file]);
      files.push(file);
    }
    if (ENGINE === "tesseract") return await Promise.all(files.map(tesseract));
    const { stdout } = await run(BINARY, files, { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
    const byFile = new Map<string, OcrItem[]>();
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { file: string; items: OcrItem[] };
      byFile.set(parsed.file, parsed.items);
    }
    return files.map((f) => byFile.get(f) ?? []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Tesseract (sparse text mode: UI text is scattered) gives words with boxes; words on one line become
 * one item, like Vision's lines. Missing Tesseract = nothing read (zooms on named elements are skipped).
 */
async function tesseract(file: string): Promise<OcrItem[]> {
  const out = await run("tesseract", [file, "stdout", "--psm", "11", "tsv"], { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }).catch(() => null);
  if (!out) return [];
  const rows = out.stdout.split("\n").slice(1).map((l) => l.split("\t"));
  const page = rows.find((r) => r[0] === "1");
  const [pw, ph] = page ? [Number(page[8]), Number(page[9])] : [0, 0];
  if (!pw || !ph) return [];
  const lines = new Map<string, { words: string[]; x0: number; y0: number; x1: number; y1: number; conf: number[] }>();
  for (const r of rows) {
    const text = r[11]?.trim();
    if (r[0] !== "5" || !text || Number(r[10]) < 0) continue;
    const [left, top, width, height] = [6, 7, 8, 9].map((i) => Number(r[i]));
    const key = `${r[2]}-${r[3]}-${r[4]}`; // block, paragraph, line
    const line = lines.get(key) ?? { words: [], x0: left, y0: top, x1: left + width, y1: top + height, conf: [] };
    line.words.push(text);
    line.x0 = Math.min(line.x0, left);
    line.y0 = Math.min(line.y0, top);
    line.x1 = Math.max(line.x1, left + width);
    line.y1 = Math.max(line.y1, top + height);
    line.conf.push(Number(r[10]) / 100);
    lines.set(key, line);
  }
  return [...lines.values()].map((l) => ({
    text: l.words.join(" "),
    x: l.x0 / pw,
    y: l.y0 / ph,
    w: (l.x1 - l.x0) / pw,
    h: (l.y1 - l.y0) / ph,
    conf: l.conf.reduce((a, b) => a + b, 0) / l.conf.length,
  }));
}
