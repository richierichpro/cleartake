# Progress

Spec: [SPEC.md](SPEC.md). App name: **Demopolish**.

## Status
- [x] Step 1 – App shell + upload
- [x] Step 2 – Transcription
- [x] Step 3 – Segments
- [x] Step 4 – Script rewrite (awaiting "works")
- [ ] Step 5 – AI voice + script editing
- [ ] Steps 6–15
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
    api/projects/[id]/route.ts       GET project · PATCH {title} · DELETE (removes the folder; refused while processing)
    api/projects/[id]/thumbnail/route.ts   POST jpeg → thumb.jpg
    api/projects/[id]/process/route.ts     POST {keyterms} → starts/retries the pipeline
    api/projects/[id]/segments/route.ts    POST → rebuild segments from transcript.json
    api/projects/[id]/rewrite/route.ts     POST → AI rewrite of all segments (synchronous, a few seconds)
    api/projects/[id]/media/[file]/route.ts GET any project file, with HTTP Range support
  components/
    logo.tsx
    home/upload-zone.tsx             drag & drop, read metadata + thumbnail in the browser, XHR upload progress
    home/project-grid.tsx            recent projects (read from data/projects/), skeletons, empty state, hover trash → confirm dialog → delete
    processing/processing-screen.tsx animated step tracker, key terms entry, retry, auto-opens editor when ready
    processing/keyterms-input.tsx    chip input (Enter/comma adds, Backspace removes)
    editor/script-view.tsx           Script tab: document view, timestamp gutter (hover → Play plays just that paragraph), active paragraph highlight, "Polish with AI" banner, retakes struck through
    editor/debug-drawer.tsx          Debug drawer: segmentation table + Rebuild; rewrite comparison (original vs AI, word-count change, retake flag) + Run again
    editor/editor.tsx                loads project, layout, Space shortcut, skeleton, not-found
    editor/use-playback.ts           playback state (currentTime, seek, toggle, playRange, volume) used by preview, control bar and timeline; Step 7 swaps in Remotion Player behind it
    editor/top-bar.tsx               back, editable title (saves on blur/Enter, Esc reverts), Export
    editor/left-panel.tsx            collapsible panel, 5 tabs with animated underline, empty states
    editor/preview.tsx               dot-grid canvas, aspect-fit framed <video>, play overlay, codec error state
    editor/control-bar.tsx           captions/cut (inactive placeholders), play, time, volume, timeline zoom
    editor/timeline.tsx              ruler (adaptive ticks), filmstrip video track split at paragraph boundaries, voice track (blocks only where you speak; silence stays empty; Step 5 voice clips go here), hover guide, draggable playhead, auto-follow
    ui/                              shadcn: alert-dialog, button, input, skeleton, slider, sonner, tooltip
  lib/
    types.ts                         Project types
    projects.ts                      server fs helpers (safe paths, atomic writes, mutateProject lock, read/writeJson)
    pipeline.ts                      background processing: extract audio → AssemblyAI → transcript.json → segments → AI rewrite → ready
    llm.ts                           chatJson(): LLM Gateway call with JSON schema; model from LLM_MODEL
    rewrite.ts                       rewriteScript(): the prompt + schema; applies aiText / isRetake
    segments.ts                      buildSegments(words, duration, SEGMENT_CONFIG): pure, shared by server and debug view
    assemblyai.ts                    upload / submit / poll
    ffmpeg.ts                        extractAudio (mono 16 kHz 64k MP3)
    client.ts                        browser helpers (mediaUrl, readVideoInfo, uploadVideo, updateProject)
    format.ts                        formatTime, formatRelative, titleFromFileName
data/projects/{id}/                  gitignored
  project.json
  original.{mp4|mov|webm|…}          never modified
  thumb.jpg
  audio.mp3                          extracted voiceover (Step 2)
  transcript.json                    (Step 2)
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
      "breakReason": "pause",            // pause | length | end
      "pauseAfter": 6.5
    }
  ]
}
```
Also on project.json: `"rewrite": { "model": "gemma-4-31b", "at": "…", "missing": 0 }`, set after an AI rewrite. `missing` counts paragraphs the model skipped; those keep their original text.

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
