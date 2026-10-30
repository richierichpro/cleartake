"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { buildCaptions, captionsOn } from "@/lib/captions";
import { mediaUrl, rebuildSegments, saveState, updateProject } from "@/lib/client";
import { historyReducer, initialHistory, snapshotOf } from "@/lib/history";
import { identityPlan, outputToSource } from "@/lib/sync";
import { voiceOf } from "@/lib/voice-settings";
import { outputZooms } from "@/lib/zooms";
import type { Project } from "@/lib/types";
import { ControlBar, ZOOM_LEVELS } from "./control-bar";
import { DebugDrawer } from "./debug-drawer";
import { LeftPanel, type TabId } from "./left-panel";
import { Preview } from "./preview";
import { ScriptView } from "./script-view";
import { VoiceTab } from "./voice-tab";
import { VisualsTab } from "./visuals-tab";
import { Timeline } from "./timeline";
import { TopBar } from "./top-bar";
import { usePlayback } from "./use-playback";
import { useSyncPlan } from "./use-sync-plan";
import { useEdits } from "./use-edits";
import { useZooms } from "./use-zooms";
import { ZoomsTab } from "./zooms-tab";
import { useZoomDetection } from "./use-zoom-detection";
import { FinalizePanel } from "./finalize-panel";
import { PreviewModal } from "./preview-modal";
import { outdatedVoices, useFinalize } from "./use-finalize";
import { scriptKey } from "@/lib/director";
import { buildOverlays, sceneLengths } from "@/lib/overlays";

export function Editor({ id }: { id: string }) {
  // The project plus its undo / redo history (lib/history.ts).
  const [state, dispatch] = useReducer(historyReducer, initialHistory);
  const { project, restored } = state;

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then((p) => dispatch({ type: "load", project: p }))
      .catch(() => dispatch({ type: "load", project: "missing" }));
  }, [id]);

  // Accepts a project or an updater, like setState. Edits are recorded for undo.
  const update: ProjectUpdate = useCallback((next) => dispatch({ type: "set", next, at: Date.now() }), []);

  // After undo / redo, save once things settle. The wait outlasts the panels' own delayed saves (≤ 0.7s);
  // it saves the state at that moment (not the snapshot), so an edit made right after an undo isn't lost.
  const latest = useRef(project);
  useEffect(() => {
    latest.current = project;
  });
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      const p = latest.current;
      if (p && p !== "missing") saveState(id, snapshotOf(p)).catch(() => toast.error("Couldn't save the undo"));
    }, 900);
    return () => clearTimeout(t);
  }, [restored, id]);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;
  const history = useMemo(
    () => ({ canUndo, canRedo, undo: () => dispatch({ type: "undo" }), redo: () => dispatch({ type: "redo" }) }),
    [canUndo, canRedo],
  );

  if (project === null) return <EditorSkeleton />;
  if (project === "missing") return <ProjectMissing />;
  return <EditorLoaded project={project} onChange={update} history={history} />;
}

export type History = { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };

export type ProjectUpdate = (next: Project | ((prev: Project) => Project)) => void;

function EditorLoaded({ project, onChange, history }: { project: Project; onChange: ProjectUpdate; history: History }) {
  const sync = useSyncPlan(project);
  // Until screen activity is analyzed, play the recording as-is.
  const plan = useMemo(() => sync.plan ?? identityPlan(project), [sync.plan, project]);
  // Step 15b: what the reviewed director plan adds to the video (intro/outro, badges, callouts, crossfades).
  const overlays = useMemo(() => buildOverlays(project, plan, sync.words), [project, plan, sync.words]);
  const scenes = sceneLengths(overlays);
  const playback = usePlayback(plan.outputDuration, scenes.lead, scenes.tail);
  const edits = useEdits(project, plan, onChange, playback.currentTime);
  const [tab, setTab] = useState<TabId>("script");
  // Selecting a zoom opens its controls and moves the playhead into it, so you aim on the right frame.
  const { seek } = playback;
  const onZoomSelected = useCallback(
    (outputStart: number | null) => {
      setTab("zooms");
      if (outputStart !== null) seek(outputStart + 0.3);
    },
    [seek],
  );
  const zooms = useZooms(project, plan, onChange, onZoomSelected);
  // Aiming (full frame + dashed window) only while paused inside the selected zoom; playing always shows real zooms.
  const aimed = zooms.timeline.find((z) => z.id === zooms.selectedId);
  const aiming =
    !!aimed && !playback.playing && playback.currentTime >= aimed.outStart && playback.currentTime <= aimed.outEnd;
  const playingZooms = outputZooms(project, plan, aiming ? zooms.selectedId : null);

  // Step 14: captions follow the AI voice; the button explains why when there's nothing to caption.
  const captionLines = useMemo(() => buildCaptions(project, plan), [project, plan]);
  const captionsEnabled = captionsOn(project);
  const captionsHint =
    voiceOf(project).mode !== "ai"
      ? "Captions follow the AI voice. Switch to it in the Voice tab"
      : !captionLines.length
        ? "Available once the AI voice is generated"
        : null;
  const toggleCaptions = useCallback(() => {
    const enabled = !captionsOn(project);
    onChange((p) => ({ ...p, captions: { enabled } }));
    updateProject(project.id, { captions: { enabled } }).catch(() => toast.error("Couldn't save captions"));
  }, [project, onChange]);

  const [zoomIndex, setZoomIndex] = useState(0);
  // The right-hand drawer beside the preview: Debug or Finalize (one at a time).
  const [drawer, setDrawer] = useState<"debug" | "finalize" | null>(null);
  const debugOpen = drawer === "debug";
  const finalize = useFinalize(project, onChange);
  // Finalize opens the review panel, and runs when there's no plan yet or it's out of date.
  const openFinalize = () => {
    setDrawer("finalize");
    const d = project.director;
    const stale = !d || d.scriptKey !== scriptKey(project) || outdatedVoices(project).length > 0;
    if (stale && !finalize.running) finalize.run();
  };
  const zoomDetection = useZoomDetection(project.id, debugOpen);
  // Debug: outline detected change regions while they happen (and briefly after).
  const sourceNow = outputToSource(plan, playback.currentTime);
  const debugBoxes =
    debugOpen && zoomDetection.showBoxes
      ? (zoomDetection.detection?.candidates ?? []).filter((z) => sourceNow >= z.start - 0.2 && sourceNow <= z.end + 0.8)
      : [];
  const { toggle } = playback;

  // Projects transcribed before segments existed: build them once.
  const needsSegments = project.status === "ready" && !project.segments;
  useEffect(() => {
    if (needsSegments) rebuildSegments(project.id).then(onChange).catch(() => {});
  }, [needsSegments, project.id, onChange]);

  // Space = play/pause, S = split at playhead, Delete = cut selection, Esc = clear selection
  // (unless the user is typing).
  const { split, cutSelection, setSelection } = edits;
  const { selectedId: selectedZoom, remove: removeZoom, select: selectZoom } = zooms;
  const { undo, redo } = history;
  // Full-screen preview of the finished video. The editor's shortcuts pause while it's open.
  const [previewOpen, setPreviewOpen] = useState(false);
  const { playing: editorPlaying } = playback;
  const openPreview = useCallback(() => {
    if (editorPlaying) toggle();
    setPreviewOpen(true);
  }, [editorPlaying, toggle]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewOpen) return;
      const el = e.target as HTMLElement;
      // ⌘Z / ⇧⌘Z (Ctrl on Windows): undo / redo the edit. In a text field, the field's own undo works on the text.
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y")) {
        if (el.closest("input, textarea, [contenteditable=true]")) return;
        e.preventDefault();
        if (e.key === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (el.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedZoom) removeZoom(selectedZoom);
        else cutSelection();
      } else if (e.key === "Escape") {
        setSelection(null);
        selectZoom(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, split, cutSelection, setSelection, selectedZoom, removeZoom, selectZoom, undo, redo, previewOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <TopBar project={project} onChange={onChange} debugOpen={debugOpen} onToggleDebug={() => setDrawer((o) => (o === "debug" ? null : "debug"))}
        history={history}
        onPreview={openPreview}
        finalizeOpen={drawer === "finalize"}
        finalizing={finalize.running}
        onFinalize={() => (drawer === "finalize" ? setDrawer(null) : openFinalize())}
        duration={scenes.lead + plan.outputDuration + scenes.tail}
      />
      <div className="flex min-h-0 flex-1">
        <LeftPanel
          tab={tab}
          onTab={setTab}
          content={{
            script: <ScriptView project={project} plan={plan} playback={playback} onChange={onChange} />,
            visuals: <VisualsTab project={project} onChange={onChange} finalize={finalize} onFinalize={openFinalize} />,
            zooms: <ZoomsTab zooms={zooms} />,
            voice: (
              <VoiceTab project={project} onChange={onChange} volume={playback.muted ? 0 : playback.volume} />
            ),
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {/* The Debug drawer sits beside the preview (not over it), so nothing on the video is hidden. */}
          <div className="flex min-h-0 flex-1">
            <Preview
              project={project}
              plan={plan}
              playback={playback}
              debugBoxes={debugBoxes}
              zooms={playingZooms}
              captions={captionsEnabled && !captionsHint ? captionLines : []}
              overlays={overlays}
              aim={aiming && zooms.selected ? { zoom: zooms.selected, onFocus: (x, y) => zooms.update(zooms.selected!.id, { x, y }) } : null}
            />
            <AnimatePresence>
              {debugOpen && (
                <DebugDrawer
                  project={project}
                  playback={playback}
                  sync={sync}
                  plan={plan}
                  zoomDetection={zoomDetection}
                  captions={captionLines}
                  onChange={onChange}
                  onClose={() => setDrawer(null)}
                />
              )}
              {drawer === "finalize" && (
                <FinalizePanel
                  project={project}
                  plan={plan}
                  words={sync.words}
                  playback={playback}
                  finalize={finalize}
                  placed={overlays.placed}
                  onClose={() => setDrawer(null)}
                />
              )}
            </AnimatePresence>
          </div>
          <ControlBar
            playback={playback}
            edits={edits}
            zoomIndex={zoomIndex}
            onZoomIndex={setZoomIndex}
            captions={{ enabled: captionsEnabled, unavailable: captionsHint, onToggle: toggleCaptions }}
          />
          <Timeline
            playback={playback}
            zoom={ZOOM_LEVELS[zoomIndex]}
            thumbnailUrl={project.thumbnail ? mediaUrl(project.id, project.thumbnail) : null}
            segments={project.segments}
            voice={voiceOf(project)}
            plan={plan}
            debug={debugOpen}
            edits={edits}
            zooms={zooms}
          />
        </main>
      </div>
      <AnimatePresence>
        {previewOpen && (
          <PreviewModal
            project={project}
            plan={plan}
            zooms={outputZooms(project, plan)} // every zoom (none left out for aiming)
            captions={captionsEnabled && !captionsHint ? captionLines : []}
            overlays={overlays}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="ml-auto h-9 w-24 rounded-lg" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[clamp(320px,35vw,560px)] space-y-4 border-r p-5">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="dot-grid flex flex-1 items-center justify-center p-12">
            <Skeleton className="aspect-video w-full max-w-3xl rounded-xl bg-[#EDEDF0]" />
          </div>
          <div className="h-12 border-t" />
          <div className="h-[164px] border-t p-4">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectMissing() {
  return (
    <div className="dot-grid flex h-dvh flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-white">
        <FileQuestion className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Project not found</p>
      <p className="mt-1 text-sm text-muted-foreground">It may have been deleted from the data folder.</p>
      <Link href="/" className={buttonVariants({ className: "mt-5 px-4" })}>
        Back to projects
      </Link>
    </div>
  );
}
