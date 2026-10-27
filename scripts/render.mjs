// Renders one export in its own Node process (Remotion's bundler can't run inside Next.js).
// Usage: node scripts/render.mjs <props.json> <out.mp4>
// Reports to the parent as lines prefixed with "@@" + JSON: { stage }, { progress }, { done }, { error }.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const [propsFile, outFile] = process.argv.slice(2);
const root = process.cwd();
const BUNDLE_DIR = path.join(root, ".remotion-bundle");
const send = (msg) => process.stdout.write(`@@${JSON.stringify(msg)}\n`);

// Rebundle only when the composition or the code it imports changed.
function newestSource(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

async function getBundle() {
  const stamp = path.join(BUNDLE_DIR, ".stamp");
  const newest = Math.max(newestSource(path.join(root, "src/remotion")), newestSource(path.join(root, "src/lib")));
  if (fs.existsSync(stamp) && Number(fs.readFileSync(stamp, "utf8")) >= newest) return BUNDLE_DIR;

  send({ stage: "Preparing renderer…" });
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src/remotion/index.ts"),
    outDir: BUNDLE_DIR,
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.join(root, "src") } },
    }),
    onProgress: (p) => send({ stage: `Preparing renderer… ${Math.round(p)}%` }),
  });
  fs.writeFileSync(stamp, String(newest));
  return serveUrl;
}

try {
  const inputProps = JSON.parse(fs.readFileSync(propsFile, "utf8"));
  const serveUrl = await getBundle();
  await ensureBrowser({
    onBrowserDownload: () => {
      send({ stage: "Downloading the render browser (first export only)…" });
      return {
        version: null,
        onProgress: ({ percent }) => send({ stage: `Downloading the render browser… ${Math.round(percent * 100)}%` }),
      };
    },
  });

  send({ stage: "Rendering", progress: 0 });
  const composition = await selectComposition({ serveUrl, id: "DemoVideo", inputProps });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps,
    onProgress: ({ progress }) => send({ progress }),
    // Screen recordings are mostly thin text: capture frames near-lossless and encode generously.
    jpegQuality: 95,
    crf: 16,
  });
  send({ done: true });
  process.exit(0);
} catch (err) {
  send({ error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
