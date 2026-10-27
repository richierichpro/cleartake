"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaUrl } from "@/lib/client";
import type { Project } from "@/lib/types";
import { ControlBar, ZOOM_LEVELS } from "./control-bar";
import { LeftPanel } from "./left-panel";
import { Preview } from "./preview";
import { Timeline } from "./timeline";
import { TopBar } from "./top-bar";
import { usePlayback } from "./use-playback";

export function Editor({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | "missing">(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setProject)
      .catch(() => setProject("missing"));
  }, [id]);

  if (project === null) return <EditorSkeleton />;
  if (project === "missing") return <ProjectMissing />;
  return <EditorLoaded project={project} onChange={setProject} />;
}

function EditorLoaded({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const playback = usePlayback(project.video.duration);
  const [zoomIndex, setZoomIndex] = useState(0);
  const { toggle } = playback;

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
      <TopBar project={project} onChange={onChange} />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview
            src={mediaUrl(project.id, project.video.file)}
            aspect={project.video.width / project.video.height || 16 / 9}
            playback={playback}
          />
          <ControlBar playback={playback} zoomIndex={zoomIndex} onZoomIndex={setZoomIndex} />
          <Timeline
            playback={playback}
            zoom={ZOOM_LEVELS[zoomIndex]}
            thumbnailUrl={project.thumbnail ? mediaUrl(project.id, project.thumbnail) : null}
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
