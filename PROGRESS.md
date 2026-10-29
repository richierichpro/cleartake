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
- [x] Step 10 – Visuals tab (Background)
- [–] Step 11 – Music tab: skipped by decision (not important for the hackathon). Voice loudness normalization skipped with it; revisit only if mixing original + AI voice or adding music.
- [x] Step 12 – Zoom detection (debug only)
- [x] Step 13 – Zooms tab
- [x] Step 14 – Captions
- [x] Step 15 – Finalize + polish, split in two:
  - [x] 15a – Finalize button + AI director plan, reviewed in a panel
  - [x] 15b – Render the plan: intro/outro scenes, step badges, callouts, caption emphasis, crossfades
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
- Zoom suggestions (Step 12, revised after review: pixel changes alone weren't zoom-worthy). **Zoom where the narration points**, in `lib/zoom-suggest.ts` (`ZOOM_SUGGEST_CONFIG`):
  1. LLM (gemma) lists UI elements the speaker names in each paragraph's original text (≤ 3 per paragraph, copied as spoken).
  2. `findPhraseTime` finds when it was spoken in the transcript (tolerates one word in four mismatching).
  3. OCR at −1, −0.5, 0, +1s around it: `scripts/ocr.swift` (Apple Vision, compiled once to `.cache/ocr` by `lib/ocr.ts`; macOS only; ffmpeg grabs full-res frames). People name a button as they click it, so look before. `matchScore` picks the best text line (≥ 0.6; ties → smaller box).
  4. Zoom = from min(spoken − 0.5s, frame where the text was found) to spoken + 2.5s, box = OCR text box (0–1 of the recording). Score boosted if `detectZoomCandidates` (pixel changes) saw a change there.
  5. Backup: typing (a pixel-change event ≥ 1s, ≤ 8% of the screen). Unmentioned changes are dropped. Spacing: no two zooms within 3s (best score wins).
  - Output `zoom-suggestions.json` {candidates (ZoomCandidate + reason, phrase, ocrText, confirmedByChange, score), mentions [{phrase, segmentId, status: zoom | not-spoken | not-on-screen | too-close, time, ocrText}]}. About 12s for the Telegram project (1 LLM call + OCR).
  - Limitation: zooms only appear where the narration names on-screen text; the Telegram recording names one element ("Plan Our Trip"). Manual zooms (Step 13) cover the rest.
  - Debug: "Zoom suggestions" lists each zoom (why: "You said X → on screen Y · screen changed there") and every mention with its status; boxes are outlined on the preview while they happen (+0.8s). `recordingBox()` in lib/visuals.ts gives the recording's rect on the canvas (shared with the composition).
  - The Debug drawer now sits beside the preview (the preview shrinks) instead of covering it.
- Zooms (Step 13): `project.zooms = { enabled, items: [{id, start, end, x, y, scale, enabled}] }`, **start/end in source time** (they stay on the right moment when the edit retimes); x/y = focus 0–1 of the recording; scale 1.2–2.5. `lib/zooms.ts`: ZOOM_LIMITS (3s min gap, 3s default length, 0.7s spring in/out), `outputZooms(project, plan, exclude)` → composition `zooms` prop (output seconds), `zoomWindow()` (visible part, clamped inside the frame), `zoomFromSuggestion()` (scale so the box ×2.5 fills the view), `fitsBetween()`.
  - Composition: `useZoomTransform` = spring in at start, spring out after end; `scale(s) translate(-left%, -top%)` on the recording inside the rounded frame.
  - Editor (`use-zooms.ts`): add at a time (refused within 3s of another), drag move/resize on the zoom track (clamped by the gap rule), Delete removes the selected zoom (otherwise Delete cuts), Esc deselects. Auto-detect turns the Step 12 suggestions into zooms on click only, each at least 3s of *output* (sped-up paragraphs compress source time). Selecting a zoom opens the Zooms tab and seeks into it; while paused inside the selected zoom, the Player leaves that zoom out and shows a dashed window + focus dot (clicking the video sets the focus); pressing play always plays every zoom, no need to deselect.
  - The left panel's tab is now controlled by the editor (`tab` / `onTab`).
- Captions (Step 14): `project.captions = { enabled }` (off by default), toggled by the captions button in the control bar. Built from the **AI voice only**: each clip stores `words` (from the ElevenLabs character timestamps, `alignmentToWords`); clips voiced earlier are backfilled from their cached `voice-{hash}.json` on GET /api/projects/[id] (no ElevenLabs call). `lib/captions.ts` `buildCaptions(project, plan)` (pure, shared by the editor and export): each clip's words shifted by its `outputStart`; a caption ends at a sentence end, a pause ≥ 0.4s or the paragraph end; longer ones (> 36 chars / 7 words) are split evenly; each stays 0.4s after its last word but never overlaps the next. Composition `<Captions>`: dark rounded pill at the bottom of the canvas (above the zoom, so it never zooms), 44px@1080p system font, the word being spoken in #FF5C35, a short fade/slide in. The button is inactive with a reason in original-voice mode or when no voice is generated. Debug: "Captions" lists every caption, its length and why it ended (click seeks).
- Finalize (Step 15a): **Finalize** button in the top bar opens a panel beside the preview (shares the space with Debug, one at a time). Clicking it runs when there's no plan or it's stale (script fingerprint `scriptKey` changed, or a voice clip is missing/outdated): 1) regenerates outdated AI voice clips one by one (existing voice route, progress shown), 2) POST /director (`lib/director-ai.ts`): one LLM call with the active paragraphs (output start/end + narrated text), video length and zooms → title, subtitle, steps `{paragraphId, phrase, label}`, callouts `{paragraphId, phrase, text}` (max one per 20s of video), emphasis `{paragraphId, word}` (≤ 2 per paragraph), outro. Validated: unknown paragraphs, emphasis words not in the text, callouts over the limit → `dropped` (shown under "AI suggestions left out"). Saved as `project.director`.
  - Items point at a paragraph + a spoken phrase, never a time: `placeDirector()` (lib/director.ts, pure) finds when the phrase is spoken (AI voice word timings, or the transcript in original mode) and falls back to the paragraph start; callouts closer than 20s are hidden with a note. Steps are anchored to a phrase too, because paragraphs are long and can contain several tasks.
  - "+ Add" on Step labels and Callouts adds one at the playhead, anchored like the AI's items: `anchorAt()` takes the paragraph under the playhead and the shortest phrase (2–6 words) starting at the next spoken word that's unique in it. The new row is focused with its text selected.
  - Review panel: every item is editable (saved debounced via PATCH `director`, through `cleanPlan`) or removable; clicking a time seeks there. "Re-run" asks the AI again. Phrase matching (`findPhraseTime`) moved to `lib/text-match.ts` (shared with zoom suggestions). `lib/sync-server.ts` `loadSyncPlan()` builds the editor's plan on the server (export + director).
- Rendering the plan (Step 15b): `lib/overlays.ts` `buildOverlays(project, plan, words)` (pure; editor + export) → composition `overlays` prop. OVERLAY_CONFIG: intro 2s, outro 2s, step badge 3s, callout 3.5s, in 0.4s / out 0.3s, crossfade 0.2s.
  - **Restraint rule** (nothing animates during another animation): zoom ease-in/out windows are "busy"; crossfades at cuts (a piece whose source doesn't continue the previous one) are skipped when they'd overlap one; badges then callouts are scheduled at the earliest start (≤ 1.5s later) whose in/out animations hit no busy window. Step badges share one spot, so close ones **queue**: each stays ≥ 2s (`stepMinRead`) and the next slides in as it leaves; one that would show > 2.5s after its phrase (`stepMaxLag`) is hidden. A badge stays until the next one if the gap would be < 1.5s (no blink). Durations: automatic from the text (`itemDuration`: 1.5s + words / 2.5 per second, at least 3s for steps / 3.5s for callouts, at most 6s), or set per item with the − / + control in the Finalize panel (`duration`, 1.5–8s; click the value to go back to auto). A hand-set step duration isn't stretched to the next badge. Callouts closer than 20s are hidden (placeDirector). The Finalize panel shows the final times and why something moved or is hidden; a hidden step/callout has a "Hidden" tag and "Show this one instead" (removes the item it's too close to, `Placement.hiddenBy`, with Undo).
  - Composition: `<Sequence>` intro → video → outro. The intro card crossfades into a frozen first frame of the video; the last frame fades out under the outro card (frozen `<Main still>` copies, no sound), so the video itself never fades (pausing at 00:00 shows the video). White title card on the background (dark #111113 canvas when the background is off). Step badge top-left (orange number + label), callout = lower third bottom-left above the captions. Crossfade: the incoming piece fades in over the previous one, which plays 0.2s longer underneath.
  - Captions: the current word now gets an orange background (padding with equal negative margin, so words don't shift); emphasized words are orange text (first occurrence in the paragraph, `markEmphasis`).
  - Playback: `usePlayback(duration, lead, tail)`; the Player is longer by the intro/outro, the playhead stays in video time (rests at 00:00 during the intro, at the end during the outro). Paused, it rests on the video's first frame; play at 00:00 (or after the end) starts with the intro.
  - 3D fly-in (`scenes.flyIn`, on by default, switch in Visuals → Scenes under the Intro card): the intro gets 1.3s longer (`OVERLAY_CONFIG.flyIn`); the card fades, then `<FlyIn>` brings the video's first frame up from below, tilted back (rotateX 38° → 0, perspective from the bottom) with 3 blurred, fading echoes lagging 3 frames each, landing flat as the video starts. All layers are frozen frames (`<Main still bare>`), so it costs nothing outside those 1.3s.
  - Visuals → Scenes: intro/outro switches (`project.scenes`, both on by default) + the title, subtitle and closing line (same fields as the Finalize panel). An empty title or closing line skips its card. Export length includes the cards.
- No narration in the recording: the Script tab offers **Write the narration** → POST /segments `{ blank: true }` makes one empty paragraph over the whole video (`blankSegment`) and switches to AI voice; the user writes it and splits with + Add. The AI rewrite skips paragraphs with no `originalText` (it would wipe hand-written text), and the Polish banner hides when nothing was said.
- Undo / redo: buttons in the top bar + ⌘Z / ⇧⌘Z (Ctrl+Y); inside a text field the field's own text undo applies. `lib/history.ts`: the Editor holds the project in `historyReducer`; every `onChange` that changes an editable part (`EDITABLE`: segments, cuts, trim, splits, zooms, visuals, captions, director, scenes, voice) records the previous snapshot; changes < 800ms apart merge into one step (typing, drags); 100 steps. Undo/redo restore the snapshot locally at once and PUT it to `/api/projects/[id]/state` 900ms later (after the panels' own delayed saves, ≤ 700ms), which replaces all editable fields in one write. Voice clips stay on disk, so undoing/redoing a regenerated voice is free.
- Processing now records the AI voice (status `voicing`, "Recording the AI voice (1 of 3)…") after the rewrite, in AI mode, for every paragraph whose clip is missing/outdated, so the editor opens already narrated. A voice failure (no key, out of credits) doesn't fail processing; the ready message says the voice will be generated in the editor. Job registries (`pipeline.ts` processing, `export.ts` exports) live on `globalThis`: in dev each route can load its own module copy, and GET /projects/[id] used to think a running job was interrupted and flash "Processing failed".
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
    api/projects/[id]/zoom-candidates/route.ts  POST → suggestZooms (narration + OCR), save zoom-suggestions.json
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
    editor/use-zooms.ts              zoom selection/add/update/setRange/remove/autoDetect (the editor leaves the selected zoom out of the Player only while aiming)
    editor/zooms-tab.tsx             "Add zoom effects" toggle, Auto-detect, selected zoom (level slider, focus hint, enabled, delete), zoom list
    editor/use-edits.ts              selection + split / cutSelection / restoreCut / setTrim, each with an Undo toast
    editor/use-zoom-detection.ts     loads cached zoom candidates when Debug opens; Re-detect; show-boxes toggle
    editor/use-sync-plan.ts          loads motion + transcript, auto-analyzes old projects, memoizes buildSyncPlan
    editor/editor.tsx                loads project, layout, Space shortcut, skeleton, not-found
    editor/use-playback.ts           Remotion Player-backed playback (output time): currentTime, seek, toggle, playRange, volume/mute, attachPlayer
    editor/top-bar.tsx               back, editable title (saves on blur/Enter, Esc reverts), Debug, Finalize, Export
    editor/finalize-panel.tsx        Step 15 review panel: progress, intro/steps/callouts/emphasis/outro, edit/remove, dropped items
    editor/use-finalize.ts           run (outdated voices → director), debounced plan edits
    editor/export-button.tsx         Export button (shows % while rendering) + popover: idle / rendering (stage + bar) / ready (Download, Export again) / error; silent-paragraph warning; toast when done
    editor/left-panel.tsx            collapsible panel, 5 tabs with animated underline, empty states
    editor/preview.tsx               dot-grid canvas, aspect-fit framed Remotion <Player> of DemoVideo, play overlay, "N paragraphs will play silently" pill, codec error fallback
    editor/control-bar.tsx           captions toggle, ✂ split, "Cut Xs" when something is selected, play, time, volume, timeline zoom
    editor/timeline.tsx              zoom track (blocks, hover ghost "Add zoom" / "Too close", drag to move, edges to resize); (output time) video track = plan pieces (paragraph number, speed badge, freeze hatch, cut markers), voice track = clips where they play (dashed if missing/outdated), debug strips while the drawer is open (activity: speaking/moving/still; plan: cut/4×/freeze ticks); ruler (adaptive ticks), filmstrip split at paragraph boundaries (deleted ones faded), voice track (real AI clip length, orange dot if outdated, dashed if no voice yet, amber if the clip overruns its paragraph), hover guide, draggable playhead, auto-follow
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
    zooms.ts                         (shared) ZOOM_LIMITS, outputZooms, zoomWindow, zoomFromSuggestion, fitsBetween
    captions.ts                      (shared) CAPTION_CONFIG, alignmentToWords, buildCaptions, captionsOn
    director.ts                      (shared) DIRECTOR_CONFIG, activeParagraphs, scriptKey, cleanPlan, placeDirector
    director-ai.ts                   runDirector: LLM edit plan + validation → project.director
    sync-server.ts                   loadSyncPlan(project): the editor's plan on the server
    text-match.ts                    (shared) norm, tokens, findPhraseTime
    overlays.ts                      (shared) OVERLAY_CONFIG, buildOverlays (scheduling + restraint), sceneLengths, scenesOf, drawnOverlays
    zoom-detect.ts                   (pure) ZOOM_DETECT_CONFIG, detectZoomCandidates (pixel-change regions; backup signal)
    zoom-suggest.ts                  suggestZooms: LLM mentions → transcript time → OCR box; typing backup; 3s spacing
    ocr.ts                           ocrFrames(video, times): builds .cache/ocr from scripts/ocr.swift, returns text boxes
    format.ts                        formatTime, formatRelative, titleFromFileName
  remotion/
    demo-video.tsx                   DemoVideo composition (preview + export)
    constants.ts                     FPS, export qualities, compositionSize(w, h, quality), estimateRenderSeconds (no React; safe on the server)
    root.tsx / index.ts              Composition "DemoVideo" with calculateMetadata from props; registerRoot (render bundle entry)
scripts/
  ocr.swift                          Apple Vision OCR helper (compiled to .cache/ocr on first use)
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
  zoom-suggestions.json              zoom suggestions + mentions (Step 12)
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
        "model": "eleven_flash_v2_5", "duration": 3.3,
        "words": [{ "text": "This", "start": 0, "end": 0.23 }]   // Step 14; clip seconds
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

`"zooms": { "enabled": true, "items": [{ "id", "start", "end" (source s), "x", "y" (0–1), "scale" (1.2–2.5), "enabled" }] }` (Step 13).

`"captions": { "enabled": true }` (Step 14; off when missing).

`"director": { "title", "subtitle", "outro", "steps": [{ "id", "segmentId", "phrase", "label" }], "callouts": [{ "id", "segmentId", "phrase", "text" }], "emphasis": [{ "id", "segmentId", "word" }], "dropped": [{ "kind", "text", "reason" }], "scriptKey", "model", "at" }` (Step 15a; times are derived from the phrases).

`"scenes": { "intro": true, "outro": true }` (Step 15b; both on when missing).

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
