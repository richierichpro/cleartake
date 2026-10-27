# Progress

Spec: [SPEC.md](SPEC.md). App name: **Demopolish**.

## Status
- [x] Step 1 – App shell + upload (awaiting "works")
- [ ] Step 2 – Transcription
- [ ] Steps 3–15

## Run
```bash
npm install
npm run dev          # http://localhost:3000
```
`ffmpeg` is not installed yet (`brew install ffmpeg`); Step 2 needs it.

## Stack notes
- Next.js 16.4 (App Router, `cacheComponents` on). Its docs ship in `node_modules/next/dist/docs/`.
  - Dynamic pages read `params` inside `<Suspense>` (see `src/app/projects/[id]/page.tsx`).
  - `PageProps`, `LayoutProps` and `RouteContext` are global types from `next typegen` / `next dev`.
- shadcn/ui "base-nova" style is built on **Base UI**, not Radix. Use the `render` prop instead of `asChild`. Slider values are arrays (`value={[n]}`).
- Tailwind v4 tokens live in `src/app/globals.css`: `brand` (#FF5C35), `canvas` (#F5F5F6), plus the `.dot-grid` and `.scroll-thin` helpers.
- Pages are client-rendered and fetch from the API routes. The filesystem is only touched in route handlers.

## File structure
```
src/
  app/
    layout.tsx                       fonts, TooltipProvider, Toaster
    page.tsx                         Home
    projects/[id]/page.tsx           Editor route (Suspense → <Editor id>)
    api/projects/route.ts            GET list · POST upload (raw body streamed to disk)
    api/projects/[id]/route.ts       GET project · PATCH {title}
    api/projects/[id]/thumbnail/route.ts   POST jpeg → thumb.jpg
    api/projects/[id]/media/[file]/route.ts GET any project file, with HTTP Range support
  components/
    logo.tsx
    home/upload-zone.tsx             drag & drop, read metadata + thumbnail in the browser, XHR upload progress
    home/project-grid.tsx            recent projects, skeletons, empty state
    editor/editor.tsx                loads project, layout, Space shortcut, skeleton, not-found
    editor/use-playback.ts           playback state (currentTime, seek, toggle, volume) used by preview, control bar and timeline; Step 7 swaps in Remotion Player behind it
    editor/top-bar.tsx               back, editable title (saves on blur/Enter, Esc reverts), Export
    editor/left-panel.tsx            collapsible panel, 5 tabs with animated underline, empty states
    editor/preview.tsx               dot-grid canvas, aspect-fit framed <video>, play overlay, codec error state
    editor/control-bar.tsx           captions/cut (inactive placeholders), play, time, volume, timeline zoom
    editor/timeline.tsx              ruler (adaptive ticks), filmstrip video track, hover guide, draggable playhead, auto-follow
    ui/                              shadcn: button, input, skeleton, slider, sonner, tooltip
  lib/
    types.ts                         Project types
    projects.ts                      server fs helpers (safe paths, atomic writes)
    client.ts                        browser helpers (mediaUrl, readVideoInfo, uploadVideo, updateProject)
    format.ts                        formatTime, formatRelative, titleFromFileName
data/projects/{id}/                  gitignored
  project.json
  original.{mp4|mov|webm|…}          never modified
  thumb.jpg
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
  "thumbnail": "thumb.jpg"         // or null if the browser couldn't decode the video
}
```
