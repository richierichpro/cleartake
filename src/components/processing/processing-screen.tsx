"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RotateCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/logo";
import { mediaUrl, startProcessing } from "@/lib/client";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/lib/types";
import { KeytermsInput } from "./keyterms-input";

type StepState = "done" | "active" | "pending" | "error" | "later";

// "later" steps are part of the pipeline but not built yet; they're skipped for now.
const STEPS: { id: ProjectStatus | "uploading"; label: string; later?: boolean }[] = [
  { id: "uploading", label: "Uploading" },
  { id: "transcribing", label: "Transcribing" },
  { id: "writing", label: "Writing script", later: true },
  { id: "voicing", label: "Generating voice", later: true },
  { id: "ready", label: "Ready" },
];
const ORDER = STEPS.map((s) => s.id);

function stepState(index: number, project: Project): StepState {
  if (index === 0) return "done"; // the file is on disk by the time this screen exists
  const step = STEPS[index];
  if (project.status === "uploaded") return "pending";
  const failedAt = project.status === "error" ? ORDER.indexOf(project.error?.step ?? "transcribing") : -1;
  const current = failedAt >= 0 ? failedAt : ORDER.indexOf(project.status);
  if (index === failedAt) return "error";
  if (step.later) return current > index ? "later" : "pending";
  if (project.status === "ready" && index === current) return "done";
  if (index < current) return "done";
  if (index === current) return "active";
  return "pending";
}

export function ProcessingScreen({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [keyterms, setKeyterms] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Poll while processing; stop once it's ready, errored or waiting for input.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const res = await fetch(`/api/projects/${id}`).catch(() => null);
      if (stop) return;
      if (!res?.ok) return router.replace("/projects/" + id);
      const p = (await res.json()) as Project;
      setProject(p);
      setKeyterms((k) => (k.length ? k : (p.keyterms ?? [])));
      setNow(Date.now());
      if (!["uploaded", "ready", "error"].includes(p.status)) timer = setTimeout(load, 1000);
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router, starting]);

  useEffect(() => {
    if (project?.status !== "ready" || project.statusDetail?.startsWith("No speech")) return;
    const t = setTimeout(() => router.push(`/projects/${id}`), 1400);
    return () => clearTimeout(t);
  }, [project?.status, project?.statusDetail, id, router]);

  async function start() {
    setStarting(true);
    try {
      setProject(await startProcessing(id, keyterms));
    } catch (err) {
      toast.error("Couldn't start processing", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="dot-grid flex min-h-dvh flex-col">
      <header className="flex h-14 items-center gap-3 px-5">
        <Link href="/" aria-label="All projects" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft />
        </Link>
        <Logo />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-[8vh] pb-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-[460px] overflow-hidden rounded-2xl border bg-white shadow-[0_24px_60px_-28px_rgba(17,17,19,0.25)]"
        >
          {!project ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-24 w-full rounded-xl" />
              {STEPS.map((s) => (
                <Skeleton key={s.id} className="h-5 w-2/3" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b p-4">
                <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {project.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(project.id, project.thumbnail)} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{project.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatTime(project.video.duration)} recording</p>
                </div>
              </div>

              <ol className="px-6 py-5">
                {STEPS.map((step, i) => {
                  const state = stepState(i, project);
                  const elapsed = project.stepStartedAt ? (now - new Date(project.stepStartedAt).getTime()) / 1000 : 0;
                  return (
                    <Step
                      key={step.id}
                      label={step.label}
                      state={state}
                      last={i === STEPS.length - 1}
                      detail={
                        state === "active"
                          ? project.statusDetail
                          : state === "error"
                            ? project.error?.message
                            : state === "later"
                              ? "Not enabled yet"
                              : step.id === "ready" && state === "done"
                                ? project.statusDetail?.startsWith("No speech")
                                  ? project.statusDetail
                                  : "Opening the editor…"
                                : undefined
                      }
                      elapsed={state === "active" ? elapsed : undefined}
                    />
                  );
                })}
              </ol>

              <AnimatePresence initial={false}>
                {project.status === "uploaded" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t bg-[#FAFAFB]"
                  >
                    <div className="p-5">
                      <p className="text-sm font-medium">Key terms</p>
                      <p className="mt-1 mb-3 text-[13px] text-muted-foreground">
                        Product names or technical words we should spell correctly. Optional.
                      </p>
                      <KeytermsInput value={keyterms} onChange={setKeyterms} />
                      <Button size="lg" className="mt-4 w-full gap-2" onClick={start} disabled={starting}>
                        <Sparkles className="text-brand" />
                        Start processing
                      </Button>
                    </div>
                  </motion.div>
                )}
                {project.status === "error" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="flex gap-2 overflow-hidden border-t bg-[#FAFAFB] p-4"
                  >
                    <Button size="lg" className="flex-1 gap-2" onClick={start} disabled={starting}>
                      <RotateCw /> Retry
                    </Button>
                    <Link href={`/projects/${id}`} className={buttonVariants({ variant: "outline", size: "lg", className: "flex-1" })}>
                      Open editor anyway
                    </Link>
                  </motion.div>
                )}
                {project.status === "ready" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden border-t bg-[#FAFAFB] p-4"
                  >
                    <Link href={`/projects/${id}`} className={buttonVariants({ size: "lg", className: "w-full gap-2" })}>
                      Open editor <ArrowRight />
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function Step({
  label,
  state,
  detail,
  elapsed,
  last,
}: {
  label: string;
  state: StepState;
  detail?: string;
  elapsed?: number;
  last: boolean;
}) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {!last && (
        <span
          className={cn(
            "absolute top-7 bottom-1 left-[11px] w-px transition-colors duration-500",
            state === "done" ? "bg-foreground" : "bg-border",
          )}
        />
      )}
      <StepIcon state={state} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm transition-colors",
              state === "pending" || state === "later" ? "text-muted-foreground" : "font-medium text-foreground",
            )}
          >
            {label}
          </span>
          {elapsed !== undefined && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{formatTime(elapsed)}</span>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {detail && (
            <motion.p
              key={detail}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18 }}
              className={cn("mt-0.5 text-[13px]", state === "error" ? "text-destructive" : "text-muted-foreground")}
            >
              {detail}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function StepIcon({ state }: { state: StepState }) {
  return (
    <div className="relative flex size-6 shrink-0 items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {state === "done" && (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="flex size-6 items-center justify-center rounded-full bg-foreground text-white"
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </motion.span>
        )}
        {state === "active" && (
          <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex size-6">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
            <span className="absolute inset-[7px] rounded-full bg-brand" />
          </motion.span>
        )}
        {state === "error" && (
          <motion.span
            key="error"
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            className="flex size-6 items-center justify-center rounded-full bg-destructive text-white"
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </motion.span>
        )}
        {(state === "pending" || state === "later") && (
          <motion.span
            key="pending"
            className={cn("size-6 rounded-full border-2", state === "later" ? "border-dashed border-border" : "border-border")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
