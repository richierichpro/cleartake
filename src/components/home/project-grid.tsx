"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteProject, mediaUrl } from "@/lib/client";
import { formatRelative, formatTime } from "@/lib/format";
import type { Project } from "@/lib/types";

const STATUS_LABEL: Record<Project["status"], string> = {
  uploaded: "Not processed yet",
  transcribing: "Transcribing…",
  writing: "Writing script…",
  voicing: "Generating voice…",
  ready: "Ready",
  error: "Processing failed",
};

export function ProjectGrid() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteProject(pendingDelete.id);
      setProjects((list) => list?.filter((p) => p.id !== pendingDelete.id) ?? null);
      toast.success("Project deleted");
      setPendingDelete(null);
    } catch (err) {
      toast.error("Couldn't delete project", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  if (projects === null) {
    return (
      <Grid>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        ))}
      </Grid>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border bg-white px-6 py-14 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
          <Clapperboard className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No projects yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Upload a recording above and it will show up here.</p>
      </div>
    );
  }

  return (
    <>
      <Grid>
        <AnimatePresence initial={false}>
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
            >
              <ProjectCard project={p} onDelete={() => setPendingDelete(p)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </Grid>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; and its recording, transcript and edits will be removed from this computer.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  return (
    <div className="group/card relative">
      <Link
        href={project.status === "ready" ? `/projects/${project.id}` : `/projects/${project.id}/processing`}
        className="group block outline-none"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#D4D4DA] group-hover:shadow-[0_8px_24px_-12px_rgba(17,17,19,0.25)] group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
          {project.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(project.id, project.thumbnail)} alt="" className="size-full object-cover" />
          ) : (
            <div className="dot-grid flex size-full items-center justify-center">
              <Clapperboard className="size-6 text-muted-foreground/60" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/15">
            <div className="flex size-10 scale-90 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-sm transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              <Play className="ml-0.5 size-4 fill-current" />
            </div>
          </div>
          <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
            {formatTime(project.video.duration)}
          </span>
        </div>
        <p className="mt-3 truncate text-sm font-medium">{project.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {project.status === "ready" ? `Edited ${formatRelative(project.updatedAt)}` : STATUS_LABEL[project.status]}
        </p>
      </Link>
      <button
        onClick={onDelete}
        aria-label={`Delete ${project.title}`}
        className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg bg-white/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150 group-hover/card:-translate-y-0.5 group-hover/card:opacity-100 hover:bg-white hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
