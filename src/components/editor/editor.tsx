"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { buildCaptions, captionsOn } from "@/lib/captions";
import { mediaUrl, rebuildSegments, updateProject } from "@/lib/client";
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

export function Editor({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | "missing">(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setProject)
      .catch(() => setProject("missing"));
  }, [id]);

  // Accepts a project or an updater, like setState.
  const update: ProjectUpdate = useCallback(
    (next) => setProject((prev) => (typeof next === "function" ? next(prev as Project) : next)),
    [],
  );

  if (project === null) return <EditorSkeleton />;
  if (project === "missing") return <ProjectMissing />;
  return <EditorLoaded project={project} onChange={update} />;
}

export type ProjectUpdate = (next: Project | ((prev: Project) => Project)) => void;

function EditorLoaded({ project, onChange }: { project: Project; onChange: ProjectUpdate }) {
  const sync = useSyncPlan(project);
  // Until screen activity is analyzed, play the recording as-is.
  const plan = useMemo(() => sync.plan ?? identityPlan(project), [sync.plan, project]);
  const playback = usePlayback(plan.outputDuration);
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
  const [debugOpen, setDebugOpen] = useState(false);
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
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
  }, [toggle, split, cutSelection, setSelection, selectedZoom, removeZoom, selectZoom]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <TopBar project={project} onChange={onChange} debugOpen={debugOpen} onToggleDebug={() => setDebugOpen((o) => !o)}
        duration={plan.outputDuration}
      />
      <div className="flex min-h-0 flex-1">
        <LeftPanel
          tab={tab}
          onTab={setTab}
          content={{
            script: <ScriptView project={project} plan={plan} playback={playback} onChange={onChange} />,
            visuals: <VisualsTab project={project} onChange={onChange} />,
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
                  onClose={() => setDebugOpen(false)}
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
