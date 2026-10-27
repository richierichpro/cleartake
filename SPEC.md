# Hackathon build spec: AI screen-recording video editor

I'm building this with you feature by feature for a hackathon. Read this whole file before doing anything, then check PROGRESS.md to see which step we're on.

## The app
A web app where I upload a screen recording that has my voiceover. The app:
1. Transcribes my voice with word-level timestamps (AssemblyAI).
2. Rewrites my narration into a clean, polished script (LLM via AssemblyAI's LLM Gateway, same key). I'm not a native English speaker, so fixing grammar matters.
3. Generates an AI voiceover per segment (ElevenLabs, with timestamps), or I can keep my original voice.
4. Retimes the video to match the new voice: if a voice clip is longer than its video part, freeze the last frame; if shorter, speed the video up (max 2x) and pad with silence.
5. Makes it look professional: recording framed on a background, background music, optional zooms, captions, intro/outro.
6. Everything is editable: script, voice, music, background, zooms, cuts.
7. Exports the edited video as an MP4 I can download.

## Stack
- Next.js + TypeScript, single app, runs locally
- Remotion for preview (Player) and export, using the same composition for both
- ffmpeg for audio extraction and frame sampling
- No auth, no database: each project is a folder under /data/projects/{id}/ with JSON files
- Keys in .env.local: ASSEMBLYAI_API_KEY, ELEVENLABS_API_KEY

It's a hackathon: keep it simple, no over-engineering, no extra libraries unless needed.

## Core principle
Every edit is data in the project JSON: script segments, voice settings, music, visuals, cuts, zooms. The original video file is never modified. The Remotion composition only renders what's in the JSON, so preview and export always match exactly. Each editor tab edits one part of this JSON.

## Design (important, don't make a generic UI)
Reference: I'll attach screenshots of Trupeer's editor. Match its structure and feel closely, but use our own app name, colors and icons. It must look like a real, polished product, not a hackathon form page.

Tech: Tailwind + shadcn/ui components, lucide-react icons, framer-motion for animation, sonner for toasts. Font: Geist (or Inter).

Look (light theme): panels #FFFFFF, preview canvas #F5F5F6 with a subtle dot grid, borders #E8E8EB, text #111113, muted text #6B6B73. Primary buttons are solid black with white text. One accent color #FF5C35, used sparingly for AI actions, active states and the playhead. Rounded-xl corners, hairline borders, a soft shadow only on the video frame, generous spacing.

### Screens
1. Home: large drag-and-drop zone with an animated hover state, plus a grid of recent projects with video thumbnails, title and duration.
2. Processing: an animated step tracker (Uploading -> Transcribing -> Writing script -> Generating voice -> Ready) with a live status for each step. Never a blank screen or a bare spinner.
3. Editor:
   - Top bar: back button, editable project title, Export button (black, right side).
   - Left panel (~35% width, collapsible with a chevron on its edge): tabs Script, Voice, Music, Visuals, Zooms, with an underline on the active tab.
   - Right: preview canvas (dot grid background) with the framed video centered.
   - Below the preview: a control bar (captions toggle, cut tool, play/pause, current time / duration, volume, timeline zoom -/+), then the timeline: time ruler, playhead, a segments track, cut markers, and a zoom track with rounded blocks.

### Tabs
- Script: reads like a document, not boxed cards. Timestamp gutter on the left (00:00, 00:20...), paragraph text on the right, editable inline. Intro/outro scenes show as small dashed pills at the top and bottom. Hovering a paragraph shows actions: play, regenerate voice, show original, revert to AI version, delete. A small dot marks paragraphs whose voice is outdated. "+ Add" adds a paragraph at the playhead. An empty paragraph shows the placeholder "Enter script text..." and means no narration there.
- Voice: "Use original voice" toggle; voice dropdown showing name (gender, accent, style) with a preview play button.
- Music: "Add background music" toggle, track dropdown, volume slider with a number box.
- Visuals: sub-tabs Background and Scenes. Background: on/off toggle, grid of 8 preset gradients/wallpapers (check mark on the selected one), custom image upload, shadow dropdown (None / Light / Medium / Strong), rounded corners slider + number box, padding slider + number box. Scenes: intro and outro on/off, title, subtitle, duration.
- Zooms: "Add zoom effects" toggle, "Auto-detect zooms" button, a hint ("Hover over the timeline to add a zoom, click one to edit it"), and controls for the selected zoom.

### Polish rules for every step
- Every async action shows progress (skeletons, progress bars, toasts), never a frozen UI
- Hover and active states on everything clickable, smooth transitions (150-250ms)
- Empty states with a short helpful message, not blank areas
- Keyboard: space = play/pause, S = split at playhead, Delete = remove selected
- Debug views go in a collapsible "Debug" drawer so the main UI stays clean for the demo

## How we work (important)
- At the start of every session, read this file and PROGRESS.md.
- Build ONE step at a time from the roadmap below. Never write code for future steps, but design data structures knowing what's coming.
- Start each step by telling me in 2-3 lines what I'll see when it's done. If anything about how it should look or behave is unclear, ask me instead of guessing.
- If you're unsure how an API works (AssemblyAI LLM Gateway, ElevenLabs timestamps, Remotion), say so and check the docs or ask me. Don't invent endpoints.
- Keep each step's code small. When changing an existing file, show only what changed and name the file.
- End every step with "How to test": exact commands, what to click, and what I should see if it works.
- Then STOP and wait. I'll reply "works" or tell you what's wrong. Don't move on until I say "next".
- For anything automatic (segments, rewrite, sync, zooms), first build a debug view that shows the decisions, so I can check them before they're applied.
- After each step, update PROGRESS.md: steps done, file structure, JSON formats.

## Roadmap
Steps 1-10 are the core demo. Steps 11 and later only if there's time.

**Step 1 - App shell + upload:** set up the design system, the Home screen with drag-and-drop upload and recent projects, and the Editor layout (top bar, tabbed left panel with empty tabs, preview canvas, control bar, timeline ruler with playhead). The uploaded video plays in the preview.

**Step 2 - Transcription:** extract audio with ffmpeg, send it to AssemblyAI with keyterms prompting (a short list of product names/technical words I can enter before processing), save words with timestamps. Show progress on the Processing screen. Show the raw transcript in the Script tab; clicking a timestamp seeks the video.

**Step 3 - Segments:** group the transcript into paragraph-sized segments of about 10-30 seconds, breaking at pauses longer than ~1s and at sentence ends. Show them in the Script tab with the timestamp gutter; clicking a timestamp plays that segment. Show segments as blocks on the timeline.

**Step 4 - Script rewrite:** send all segments to the LLM, get JSON back with polished text per segment id. The speaker is not a native English speaker, so the transcript will have grammar mistakes, wrong word choices and broken sentences. Rewrite each segment into clear, natural, professional English that sounds good read aloud. Remove fillers, repeats and false starts. Keep the original meaning and don't add any information that wasn't said. Keep each segment roughly the same length so it still fits its part of the video. Keep the same ids. Also return "isRetake": true for segments that are pure mistakes or retakes ("sorry, let me do that again").

**Step 5 - AI voice + script editing:** ElevenLabs clip per segment using the timestamps endpoint. Cache by hash of text + voice so unchanged segments are never regenerated.
- Script tab editing works as described in the Design section: inline editing with autosave, outdated dot, show original, revert, delete.
- Never regenerate while I type. I click regenerate on a paragraph, or "Regenerate all changed".
- Empty paragraphs produce no voice.
- Each paragraph shows estimated spoken length vs its video length, with an amber warning if they differ a lot.
- Voice tab: voice dropdown with preview sample, and the "Use original voice" toggle (keeps my real audio and ignores the AI voice).

**Step 6 - Cleanup + sync plan:** pure functions, all thresholds in one config object so I can tune them.
1. Activity map: sample frames at 5 fps with ffmpeg (small grayscale). Motion score = % of pixels that changed vs the previous frame. Label every 0.2s slot as "speaking" (inside a transcript word range, +/- 0.3s), "moving" (silent, motion above ~0.5%) or "still" (silent, motion below that). Save the motion data; Step 12 reuses it.
2. Cleanup rules: silent + still for more than 1.5s -> cut it, keeping 0.4s. Silent + moving for more than 2s (loading, typing, scrolling) -> fast-forward 4x. Speaking -> keep at 1x. Trim the start before the first speech/movement and the end after the last, keeping 0.5s. Segments marked isRetake -> cut if the screen is still during them, fast-forward if it changes.
3. Sync per segment, after cleanup: if the cleaned video is longer than the voice, speed the whole segment up to fit (max 2x); if still longer, let the video play out with no narration. If the voice is longer, freeze the stillest frame in the segment (lowest motion score) for the difference.
4. Output: timeline pieces {sourceStart, sourceEnd, speed, freezeAfter, outputStart}. Empty segments play at 1x with no voice. With "Use original voice" on, apply cleanup only to silent parts and skip the sync retiming.
Debug view: a strip under the timeline colored by state (speaking / moving / still) plus a table of every decision (segment, original length, cleaned length, voice length, action), so I can check the logic before it touches the video.

**Step 7 - Preview:** Remotion composition that plays the timeline (video pieces with speed/freeze, voice clips, original audio muted unless original voice mode is on), embedded with Remotion Player in the preview canvas and connected to the control bar and the timeline playhead.

**Step 8 - Export + download:** the Export button renders the same composition into a 1080p MP4 (H.264) with Remotion's renderer in an API route. Live progress bar, UI stays usable, then a Download button saves {project-name}.mp4. Exports are saved in the project folder. What I see in the preview is exactly what I download.

**Step 9 - Trim and cut:**
- Drag handles at the start and end of the timeline to trim the beginning and end.
- Cut a section in the middle: press S (or use the cut tool) to split at the playhead, select the piece, press Delete. Or drag-select a range and delete it.
- Cuts are saved as {id, start, end} in source video time. Removed sections collapse into a small marker on the timeline; clicking it restores the cut.
- Deleting a paragraph in the Script tab creates a cut for its range, so it can also be restored.
- The sync plan skips cut ranges. If a cut removes part of a segment's video, that segment's voice still plays and the remaining video is retimed. If a cut covers a whole segment, its voice is removed too.
- Preview and export reflect all cuts.

**Step 10 - Visuals tab (Background):** preset backgrounds, custom image upload, shadow, rounded corners and padding, exactly as in the Design section. Changes show instantly in the preview and in the export.

**Step 11 - Music tab:** toggle, track dropdown with 3-4 royalty-free tracks I'll put in /public/music, volume slider. Duck the music under the voice and raise it slightly in pauses. Normalize voice loudness.

**Step 12 - Zoom detection (debug only):** reuse the frame diffs from Step 6 and find where the changed pixels are (bounding boxes of changed regions). Ignore changes covering most of the screen (scroll/page load) and regions that keep changing (spinners/videos). Show detected boxes on the preview in the Debug drawer. No zooming yet.

**Step 13 - Zooms tab:** zooms are a list in the project JSON ({id, start, end, x, y, scale, enabled}), never hardcoded.
- "Add zoom effects" toggle turns all zooms on/off without deleting them.
- "Auto-detect zooms" turns the Step 12 regions into suggested zooms (start ~0.5s before the change, times mapped through the sync timeline and cuts). Nothing is applied until I click it.
- Zoom track on the timeline: hover to add a zoom, click a block to select it, drag to move, drag edges to change duration, Delete to remove.
- Selected zoom controls: zoom level slider (1.2x to 2.5x), click on the preview to set the focus point.
- Zoom in/out animates smoothly with spring. No zooms closer than 3s apart.

**Step 14 - Captions:** the captions button in the control bar toggles captions built from the ElevenLabs character timestamps, with the current word highlighted.

**Step 15 - Finalize + polish:** a "Finalize" button that:
1. Regenerates any outdated voice clips and recomputes the sync plan with cuts applied.
2. Runs an AI "director" pass: send the final segments, timeline and zooms to the LLM and get back an edit plan JSON: title, subtitle, step labels (only where a new task begins), short callouts (max one per 20s), words to emphasize in captions, outro line. Show the plan for review; every item is editable or removable.
3. Renders the plan: intro and outro scenes (from Visuals > Scenes, ~2s each), step label badges that animate in, callouts as lower-thirds, emphasis words in the accent color, quick crossfades at cuts.
Keep effects restrained: nothing animating during another animation.

**Bonus (only if I ask):** zoom to UI text mentioned in the narration using OCR; translate the voiceover into Hindi (translate button in the top bar).
