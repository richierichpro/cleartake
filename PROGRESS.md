# Progress

Spec: [SPEC.md](SPEC.md). App name: **Demopolish**.

## Status
- [x] Step 1 – App shell + upload
- [x] Step 2 – Transcription
- [x] Step 3 – Segments
- [x] Step 4 – Script rewrite
- [x] Step 5 – AI voice + script editing
- [x] Step 6 – Cleanup + sync plan
- [x] Step 7 – Preview (Remotion)
- [x] Step 8 – Export + download
- [x] Step 9 – Trim and cut
- [x] Step 10 – Visuals tab (Background) (awaiting "works")
- [ ] Step 11 – Music tab
- [ ] Steps 12–15
- Planned (Step 6b, if Step 6 shows drift): sync points. A few auto-placed anchors inside a paragraph (at pauses and screen changes), kept through the AI rewrite, drawn as small orange ticks; hover shows frame + Synced/Outdated, "Move to playhead", delete. Retime piecewise between anchors.
- Open question: paragraphs are 10–30s. Consider 5–15s (config: min 5, softMax 12, max 18, pause 0.7) if Step 6 shows sync drift. Decide before editing real scripts, because Rebuild wipes edits.

Each step is committed separately on `main`, split into a few logical commits.

## Run
```bash
npm install
npm run dev          # http://localhost:3000
```
Requires `ffmpeg` (installed via Homebrew) and `.env.local`:
```
ASSEMBLYAI_API_KEY=...
ELEVENLABS_API_KEY=...   # Step 5
LLM_MODEL=gemma-4-31b    # optional; this account only has gemma-4-31b and qwen3.5-4b-32k-fast on the LLM Gateway
```

## Stack notes
- Next.js 16.4 (App Router, `cacheComponents` on). Its docs ship in `node_modules/next/dist/docs/`.
  - Dynamic pages read `params` inside `<Suspense>` (see `src/app/projects/[id]/page.tsx`).
  - `PageProps`, `LayoutProps` and `RouteContext` are global types from `next typegen` / `next dev`.
- shadcn/ui "base-nova" style is built on **Base UI**, not Radix. Use the `render` prop instead of `asChild`. Slider values are arrays (`value={[n]}`).
- Tailwind v4 tokens live in `src/app/globals.css`: `brand` (#FF5C35), `canvas` (#F5F5F6), plus the `.dot-grid` and `.scroll-thin` helpers.
- Pages are client-rendered and fetch from the API routes. The filesystem is only touched in route handlers.
- Processing runs as a fire-and-forget background job inside the Next server (`lib/pipeline.ts`). The Processing screen polls `GET /api/projects/{id}` every 1s. If the server restarts mid-job, the next GET marks the project `error` so it can be retried.
- All writes to project.json go through `mutateProject()`, which locks per project so the pipeline and the editor can't overwrite each other.
- Segments are built server-side by a pure function (`lib/segments.ts`, thresholds in `SEGMENT_CONFIG`). The pipeline builds them right after transcription; projects transcribed before Step 3 get them the first time the editor opens. Debug → Rebuild regenerates them (this will overwrite script edits once Step 5 exists).
- LLM: AssemblyAI LLM Gateway `POST https://llm-gateway.assemblyai.com/v1/chat/completions` (OpenAI format, `authorization: <key>`), with a strict `response_format: json_schema` and the `json-repair` post-processing step. Claude, GPT and Gemini return "account does not have access" on this account (they likely need a paid AssemblyAI plan), so the default is `gemma-4-31b`. It costs about $0.0001 per rewrite.
- Rewrite: one call with all segments, so the model sees the whole script. It stores `aiText` + `isRetake` and sets `text = aiText`; `originalText` is never changed. Retakes get `text: ""` (no narration). A pipeline retry skips transcription if transcript.json exists.
- ElevenLabs: `POST /v1/text-to-speech/{voice}/with-timestamps` (`xi-api-key`), model `eleven_flash_v2_5` (half the credits of v2; user's choice), `previous_text`/`next_text` set from neighbouring paragraphs. Account: free tier, 10k credits/month; the key has its own lower cap. The key only has Text to Speech, Voices (read) and User access.
- Voice is generated **only when the user clicks**: per paragraph or "Generate N changed". The pipeline's "Generating voice" step is skipped ("You'll pick a voice in the editor"). Clips are cached as `voice-{sha1(model|voice|text)}.mp3` + `.json` (character alignment), so reverting to text that was voiced before costs nothing.
- Script editing: local state updates on every keystroke; PATCH after 700ms idle or on blur. Server responses never overwrite paragraphs with unsaved typing. Delete sets `deleted: true` (restorable); Step 9 should turn this into a cut. "+ Add" splits the paragraph under the playhead.
- Media route streams with a cancel-safe web stream; `Readable.toWeb` crashed with "Controller is already closed" when the browser aborted a range request.
- After adding new route folders, restart `npm run dev` if they 404; Turbopack missed them once.
- Sync plan (Step 6) is **derived, never stored**: `buildSyncPlan(project, words, motion)` in `lib/sync.ts` (pure, thresholds in `SYNC_CONFIG`). The editor recomputes it on every project change (`use-sync-plan.ts`). Step 7 preview and Step 8 export must call the same function.
  - Activity: ffmpeg samples 5 fps, 160px-wide grayscale → `frames.gray` (raw, kept for Step 12) + `motion.json` (scores = % pixels changed > 12/255 vs the previous frame). It takes about 0.1s per second of video. It runs in the pipeline after transcription, or automatically the first time the editor opens an older project.
  - Slots of 0.2s: speaking (within 0.3s of a word), moving (> 0.5%), still. Still gaps ≤ 0.4s between moving slots count as moving (scroll flicker).
  - Cleanup: silent+still > 1.5s → cut, keeping 0.4s (0.2 each edge); silent+moving > 2s → 4×; trim lead/tail keeping 0.5s; retakes (AI mode only) → cut if < 20% moving, else 4×; deleted paragraphs → cut.
  - Sync per paragraph: cleaned video longer than the voice → speed the whole paragraph up (max 2×, multiplies cleanup speeds), any rest plays without narration. Voice longer → freeze the stillest frame (lowest max(score in, score out)) for the difference. With no current clip, the voice length is estimated (marked ≈). Original voice mode: cleanup only, no retiming, no retake cuts.
- Preview (Step 7): Remotion 4.0.539 (`remotion`, `@remotion/player`, `@remotion/media`, all the same version). `src/remotion/demo-video.tsx` is the one composition for preview and export. It only renders `inputProps` built from the sync plan: each piece is a `<Sequence>` + `<Video trimBefore playbackRate>`, freezes are `<Freeze frame={0}>` on the piece's last frame, and voice clips are `<Audio>` in `<Sequence>`s. The original audio is muted in AI mode, and pieces faster than 2× are always muted. 30 fps; size is the recording's aspect at 1080p.
- **The editor is in output (edited video) time**: player, control bar, timeline ruler and tracks, and Script paragraph timestamps. Segments/cuts stay stored in source time; convert with `sourceToOutput` / `outputToSource` / `segmentRanges` (lib/sync.ts). Until motion is analyzed, `identityPlan` plays the recording as-is.
- Player: `controls={false}`, our control bar drives it via PlayerRef (`seekTo`, `play`, `pause`, `toggle`, `setVolume`, `mute`) and the `frameupdate` / `play` / `pause` / `ended` events (`use-playback.ts`). `moveToBeginningWhenEnded={false}`. Remotion prints a license note in the console (free for individuals / companies ≤ 3 people); `acknowledgeRemotionLicense` is left unset.
- Export (Step 8): POST /export builds the same plan → `export-props.json` (absolute media URLs on the request origin) → spawns `node scripts/render.mjs` (separate process: Remotion's bundler can't run inside Next). The script bundles `src/remotion/index.ts` into `.remotion-bundle/` (rebuilt only when src/remotion or src/lib change; `@` alias added via webpackOverride), downloads Chrome Headless Shell on the first export, then `selectComposition` + `renderMedia` (h264). Progress lines `@@{json}` → `project.export`, throttled to every 2%. The previous export file is deleted on success. Download sets `Content-Disposition: {title}.mp4`.
  - Quality choice in the Export panel: 1080p / 1440p (default) / Original, never upscaling; options with identical sizes are hidden. The last export's choice is remembered. The editor Player stays at 1080p. Encoding: `jpegQuality: 95`, `crf: 16` (screen text was soft with Remotion's defaults of 80 / 18).
  - Speed: about 4.5s of render per output second at 1728×1080, scaling with pixel count (`estimateRenderSeconds`). It uses all cores, so the laptop fan spins. Benchmark hint: `concurrency: 4` was faster than 8 on this 8-core Mac (67s vs 81s); not applied yet.
  - The renderer serves its bundle on localhost:3001, so the media route sends CORS headers (+ OPTIONS). Without them, @remotion/media fell back to OffthreadVideo.
- Trim & cut (Step 9): `project.cuts` / `trim` / `splits` in source time, saved via PATCH `{ edit }` (validated and clamped server-side) with optimistic local updates. `removedRanges()` (lib/edits.ts) = cuts + trim + legacy `deleted`; the plan subtracts them exactly (`subtractRanges`) after cleanup. A partial cut keeps the paragraph's voice and retimes the rest; a full cut removes the voice ("cut by you").
  - Timeline: S / ✂ splits at the playhead; click a piece between splits on the video track to select it; drag on the video track for a range; Delete/Backspace cuts; Esc clears. Ruler and other areas scrub. Trim handles on both ends (dragging only trims further; the ✂ marker restores). Splits used by a cut are removed automatically; clicking a split line removes it. User cuts/trims show orange ✂ markers (click = restore); cleanup cuts show grey notches.
  - Script delete = PATCH segment `{deleted: true}`: adds a Cut with `segmentId`, or merges a hand-added empty paragraph into the previous one. Restore removes that cut.
- Visuals (Step 10): `project.visuals` (lib/visuals.ts: 8 CSS-gradient presets, SHADOWS in px at 1080p, defaults: background on, Aurora, medium shadow, 16px corners, 8% padding). Background on → **16:9 canvas** with the recording centred inside the padding (fit by aspect); off → the recording's own aspect, edge to edge. `frameProps()` → `DemoVideoProps.frame`; radius/shadow scale with canvas height/1080, so 1080p and 1440p exports look identical. A custom image is uploaded raw to POST /background → `background-{id}.{ext}` (replaces the preset; picking a preset clears it). Settings save debounced (300ms) with instant local preview. The Scenes sub-tab is a placeholder until Step 15.
- Toasts are top-right under the top bar so they never cover the timeline.
- Debug drawer: bug button in the top bar. It covers only the preview area so the control bar and timeline stay usable.
- AssemblyAI calls: `POST /v2/upload` (raw bytes) → `POST /v2/transcript {audio_url, language_code: "en", keyterms_prompt}` → poll `GET /v2/transcript/{id}`. Uses the default speech models (Universal-3.5 Pro, then Universal-2). Each key term is at most 6 words.

## File structure
```
src/
  app/
    layout.tsx                       fonts, TooltipProvider, Toaster
    page.tsx                         Home
    projects/[id]/page.tsx           Editor route (Suspense → <Editor id>)
    projects/[id]/processing/page.tsx  Processing route
    api/projects/route.ts            GET list · POST upload (raw body streamed to disk)
    api/projects/[id]/route.ts       GET project · PATCH {title, voice, edit, visuals} · DELETE (removes the folder; refused while processing)
    api/projects/[id]/thumbnail/route.ts   POST jpeg → thumb.jpg
    api/projects/[id]/process/route.ts     POST {keyterms} → starts/retries the pipeline
    api/projects/[id]/segments/route.ts    POST → rebuild segments from transcript.json
    api/projects/[id]/rewrite/route.ts     POST → AI rewrite of all segments (synchronous, a few seconds)
    api/projects/[id]/segments/[segmentId]/route.ts  PATCH {text?, deleted?}
    api/projects/[id]/segments/split/route.ts        POST {at} → "+ Add" paragraph at the playhead
    api/projects/[id]/voice/[segmentId]/route.ts     POST → generate (or reuse cached) AI clip for one paragraph
    api/voices/route.ts              GET → ElevenLabs voices + credits used
    api/projects/[id]/background/route.ts    POST raw image → custom background · DELETE removes it
    api/projects/[id]/export/route.ts        GET export state (marks interrupted renders) · POST start export
    api/projects/[id]/export/download/route.ts  GET latest export as "{title}.mp4"
    api/projects/[id]/activity/route.ts      POST → sample frames, save motion.json + frames.gray
    api/projects/[id]/media/[file]/route.ts GET any project file, with HTTP Range support
  components/
    logo.tsx
    home/upload-zone.tsx             drag & drop, read metadata + thumbnail in the browser, XHR upload progress
    home/project-grid.tsx            recent projects (read from data/projects/), skeletons, empty state, hover trash → confirm dialog → delete
    processing/processing-screen.tsx animated step tracker, key terms entry, retry, auto-opens editor when ready
    processing/keyterms-input.tsx    chip input (Enter/comma adds, Backspace removes)
    editor/script-view.tsx           Script tab: editable document, autosave, timestamp gutter (hover → Play; plays AI clip over the muted video), voice status dot (orange = outdated, hollow = none), voice vs video length with amber warning, hover actions (play, regenerate, show original, revert to AI, delete), "+ Add", "Generate N changed", Polish banner
    editor/visuals-tab.tsx           Background / Scenes sub-tabs; on/off, 8 preset swatches (mini window preview, ✓), image upload/replace/remove, shadow select, corners + padding slider with number box
    editor/voice-tab.tsx             Use original voice toggle, voice dropdown (name + gender/accent/style, preview button), model, credits bar
    editor/debug-drawer.tsx          Debug drawer: Cleanup & sync (duration before → after, per-paragraph decisions, cleanup actions, Re-analyze); segmentation table + Rebuild; rewrite comparison + Run again
    editor/use-edits.ts              selection + split / cutSelection / restoreCut / setTrim, each with an Undo toast
    editor/use-sync-plan.ts          loads motion + transcript, auto-analyzes old projects, memoizes buildSyncPlan
    editor/editor.tsx                loads project, layout, Space shortcut, skeleton, not-found
    editor/use-playback.ts           Remotion Player-backed playback (output time): currentTime, seek, toggle, playRange, volume/mute, attachPlayer
    editor/top-bar.tsx               back, editable title (saves on blur/Enter, Esc reverts), Debug, Export
    editor/export-button.tsx         Export button (shows % while rendering) + popover: idle / rendering (stage + bar) / ready (Download, Export again) / error; silent-paragraph warning; toast when done
    editor/left-panel.tsx            collapsible panel, 5 tabs with animated underline, empty states
    editor/preview.tsx               dot-grid canvas, aspect-fit framed Remotion <Player> of DemoVideo, play overlay, "N paragraphs will play silently" pill, codec error fallback
    editor/control-bar.tsx           captions (inactive), ✂ split, "Cut Xs" when something is selected, play, time, volume, timeline zoom
    editor/timeline.tsx              (output time) video track = plan pieces (paragraph number, speed badge, freeze hatch, cut markers), voice track = clips where they play (dashed if missing/outdated), debug strips while the drawer is open (activity: speaking/moving/still; plan: cut/4×/freeze ticks); ruler (adaptive ticks), filmstrip split at paragraph boundaries (deleted ones faded), voice track (real AI clip length, orange dot if outdated, dashed if no voice yet, amber if the clip overruns its paragraph), hover guide, draggable playhead, auto-follow
    ui/                              shadcn: alert-dialog, button, input, skeleton, slider, sonner, tooltip
  lib/
    types.ts                         Project types
    projects.ts                      server fs helpers (safe paths, atomic writes, mutateProject lock, read/writeJson)
    pipeline.ts                      background processing: extract audio → AssemblyAI → transcript.json → segments → AI rewrite → ready
    llm.ts                           chatJson(): LLM Gateway call with JSON schema; model from LLM_MODEL
    rewrite.ts                       rewriteScript(): the prompt + schema; applies aiText / isRetake
    elevenlabs.ts                    listVoices, credits, synthesize (with-timestamps)
    voice.ts                         generateSegmentVoice(): cache by hash, store clip on the segment
    motion.ts                        analyzeActivity(): ffmpeg frame sampling + motion scores
    sync.ts                          (shared, pure) SYNC_CONFIG, labelSlots, cleanup, buildSyncPlan → pieces / voice placements / decisions
    export.ts                        startExport(): props from the sync plan, spawn render, track progress
    voice-settings.ts                (shared) DEFAULT_VOICE (Matilda, flash v2.5), voiceOf, clipStatus, estimateSeconds, creditCost
    segments.ts                      buildSegments(words, duration, SEGMENT_CONFIG): pure, shared by server and debug view
    assemblyai.ts                    upload / submit / poll
    ffmpeg.ts                        extractAudio (mono 16 kHz 64k MP3)
    client.ts                        browser helpers (mediaUrl, readVideoInfo, uploadVideo, updateProject)
    edits.ts                         (shared) removedRanges, subtractRanges, isSegmentRemoved, newCutId
    visuals.ts                       (shared) presets, SHADOWS, DEFAULT_VISUALS, visualsOf, frameProps
    format.ts                        formatTime, formatRelative, titleFromFileName
  remotion/
    demo-video.tsx                   DemoVideo composition (preview + export)
    constants.ts                     FPS, export qualities, compositionSize(w, h, quality), estimateRenderSeconds (no React; safe on the server)
    root.tsx / index.ts              Composition "DemoVideo" with calculateMetadata from props; registerRoot (render bundle entry)
scripts/
  render.mjs                         export renderer (child process), reports "@@{json}" lines
data/projects/{id}/                  gitignored
  project.json
  original.{mp4|mov|webm|…}          never modified
  thumb.jpg
  audio.mp3                          extracted voiceover (Step 2)
  transcript.json                    (Step 2)
  voice-{hash}.mp3 / .json           AI clips + ElevenLabs character alignment (Step 5)
  motion.json                        { fps: 5, width: 160, height, frames, scores[] } (Step 6)
  frames.gray                        raw 8-bit gray frames, frames × width × height (Step 6; Step 12 reuses)
  background-{id}.{jpg|png|webp}     custom background image (Step 10)
  export-props.json                  inputProps of the last export (Step 8)
  export-{timestamp}.mp4             latest export (Step 8)
```

## JSON formats
`data/projects/{id}/project.json`
```json
{
  "id": "rgm0fietgo",
  "title": "Product walkthrough v2",
  "createdAt": "2026-10-28T…Z",
  "updatedAt": "2026-10-28T…Z",
  "status": "uploaded",            // uploaded | transcribing | writing | voicing | ready | error
  "video": {
    "file": "original.mp4",
    "mimeType": "video/mp4",
    "duration": 11.2,              // seconds, read in the browser
    "width": 1920,
    "height": 1080,
    "size": 2562319
  },
  "thumbnail": "thumb.jpg",        // or null if the browser couldn't decode the video
  "keyterms": ["Demopolish", "Supabase"],
  "statusDetail": "Listening to your voiceover…",   // live text for the current step
  "stepStartedAt": "2026-10-28T…Z",
  "error": null,                   // or { "step": "transcribing", "message": "…" }
  "segments": [                    // Step 3. Tiles the whole video: segments[i].end === segments[i+1].start
    {
      "id": "s1",
      "start": 0, "end": 30.0,           // video range this paragraph owns (source time, seconds)
      "speechStart": 0.6, "speechEnd": 23.2,
      "wordStart": 0, "wordEnd": 48,     // indices into transcript.words
      "originalText": "If you want to try…",
      "text": "If you'd like to try…",   // what gets narrated ("" = no narration)
      "aiText": "If you'd like to try…", // Step 4 AI version (for "revert to AI version")
      "isRetake": false,                 // Step 4; true → text "" and Step 6 cuts/speeds it
      "deleted": false,                  // Step 5; restorable; Step 9 → cut
      "voice": {                         // Step 5; last generated clip
        "file": "voice-13ed91ba5bb7cc37.mp3", "text": "…", "voiceId": "XrExE9yKIg1WjnnlVkGX",
        "model": "eleven_flash_v2_5", "duration": 3.3
      },
      "breakReason": "pause",            // pause | length | end | split
      "pauseAfter": 6.5
    }
  ]
}
```
Also on project.json: `"voice": { "mode": "ai" | "original", "voiceId", "voiceName", "model" }` (Step 5; defaults to Matilda + eleven_flash_v2_5). A clip is **outdated** when its text, voiceId or model differs from the current values.

`"cuts": [{ "id", "start", "end", "segmentId"? }]`, `"trim": { "start", "end" }`, `"splits": [seconds]` (Step 9, source time).

`"visuals": { "background": { "enabled", "preset", "image" }, "shadow": "none"|"light"|"medium"|"strong", "radius": px@1080p, "padding": % }` (Step 10).

`"export": { "status": "rendering" | "done" | "error", "quality": "1080p" | "1440p" | "original", "width", "height", "stage", "progress": 0–1, "startedAt", "finishedAt", "file", "size", "duration", "error" }` (Step 8).

And `"rewrite": { "model": "gemma-4-31b", "at": "…", "missing": 0 }`, set after an AI rewrite. `missing` counts paragraphs the model skipped; those keep their original text.

Segmentation rules (`SEGMENT_CONFIG`): paragraphs end only at sentence ends: on a pause ≥ 1s once they have ≥ 10s of speech, after 20s, or when the next sentence would pass 30s. A short last paragraph is merged into the previous one if that stays ≤ 30s. A paragraph's video starts 0.3s before its first word, so the silence after a paragraph belongs to it.
Status flow: `uploaded` (waiting for key terms) → `transcribing` → (`writing` → `voicing`, from later steps) → `ready`. Any step can go to `error`.

`data/projects/{id}/transcript.json` (times in **seconds**)
```json
{
  "assemblyId": "…",
  "createdAt": "…",
  "text": "So today I will show you…",
  "words": [{ "text": "So", "start": 0.4, "end": 0.56, "confidence": 0.97 }]
}
```

### Sync plan output (derived, not stored)
```ts
pieces: { sourceStart, sourceEnd, speed, freezeAfter, outputStart, segmentId }[]  // output length = (end-start)/speed + freezeAfter
voice:  { segmentId, file, outputStart, duration }[]                             // only paragraphs with a current clip
decisions: { segmentId, index, original, cleaned, voice, voiceEstimated, output, action }[]
actions:   { kind: "cut" | "fast", start, end, reason }[]                         // cleanup, in source time
```
