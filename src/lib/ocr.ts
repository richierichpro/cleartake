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

/** Grabs full-resolution frames at the given source times and reads the text on them. */
export async function ocrFrames(video: string, times: number[]): Promise<OcrItem[][]> {
  if (!times.length) return [];
  await ensureBinary();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cleartake-ocr-"));
  try {
    const files: string[] = [];
    for (const [i, t] of times.entries()) {
      const file = path.join(dir, `f${i}.jpg`);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "2", "-y", file]);
      files.push(file);
    }
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
