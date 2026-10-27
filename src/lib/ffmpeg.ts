import { spawn } from "node:child_process";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err: NodeJS.ErrnoException) =>
      reject(new Error(err.code === "ENOENT" ? "ffmpeg isn't installed. Run: brew install ffmpeg" : err.message)),
    );
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      if (/does not contain any stream|matches no streams/i.test(stderr)) {
        return reject(new Error("This recording has no audio track. Record with your microphone on."));
      }
      reject(new Error(`ffmpeg failed: ${stderr.trim().split("\n").slice(-2).join(" ")}`));
    });
  });
}

/** Small mono MP3 of the voiceover: plenty for speech recognition, fast to upload. */
export function extractAudio(input: string, output: string) {
  return run(["-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", output]);
}
