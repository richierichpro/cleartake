"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaUrl, rebuildSegments } from "@/lib/client";
import { identityPlan } from "@/lib/sync";
import { voiceOf } from "@/lib/voice-settings";
import type { Project } from "@/lib/types";
import { ControlBar, ZOOM_LEVELS } from "./control-bar";
import { DebugDrawer } from "./debug-drawer";
import { LeftPanel } from "./left-panel";
import { Preview } from "./preview";
import { ScriptView } from "./script-view";
import { VoiceTab } from "./voice-tab";
import { Timeline } from "./timeline";
import { TopBar } from "./top-bar";
import { usePlayback } from "./use-playback";
import { useSyncPlan } from "./use-sync-plan";

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
  const [zoomIndex, setZoomIndex] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const { toggle } = playback;

  // Projects transcribed before segments existed: build them once.
  const needsSegments = project.status === "ready" && !project.segments;
  useEffect(() => {
    if (needsSegments) rebuildSegments(project.id).then(onChange).catch(() => {});
  }, [needsSegments, project.id, onChange]);

  // Space = play/pause, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable=true]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <TopBar project={project} onChange={onChange} debugOpen={debugOpen} onToggleDebug={() => setDebugOpen((o) => !o)}
        duration={plan.outputDuration}
      />
      <div className="flex min-h-0 flex-1">
        <LeftPanel
          content={{
            script: <ScriptView project={project} plan={plan} playback={playback} onChange={onChange} />,
            voice: (
              <VoiceTab project={project} onChange={onChange} volume={playback.muted ? 0 : playback.volume} />
            ),
          }}
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Preview project={project} plan={plan} playback={playback} />
          <ControlBar playback={playback} zoomIndex={zoomIndex} onZoomIndex={setZoomIndex} />
          <Timeline
            playback={playback}
            zoom={ZOOM_LEVELS[zoomIndex]}
            thumbnailUrl={project.thumbnail ? mediaUrl(project.id, project.thumbnail) : null}
            segments={project.segments}
            voice={voiceOf(project)}
            plan={plan}
            debug={debugOpen}
          />
          <AnimatePresence>
            {debugOpen && (
              <DebugDrawer
                project={project}
                playback={playback}
                sync={sync}
                plan={plan}
                onChange={onChange}
                onClose={() => setDebugOpen(false)}
              />
            )}
          </AnimatePresence>
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
