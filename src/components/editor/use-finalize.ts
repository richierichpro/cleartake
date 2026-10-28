"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { generateVoice, runDirector, updateProject } from "@/lib/client";
import type { DirectorContent } from "@/lib/director";
import { isSegmentRemoved } from "@/lib/edits";
import { clipStatus, voiceOf } from "@/lib/voice-settings";
import type { Project } from "@/lib/types";
import type { ProjectUpdate } from "./editor";

export type FinalizeState =
  | { phase: "idle" }
  | { phase: "voice"; done: number; total: number }
  | { phase: "director" }
  | { phase: "error"; step: "voice" | "director"; message: string };

/** Paragraphs in the video whose AI voice is missing or outdated. */
export function outdatedVoices(project: Project) {
  const v = voiceOf(project);
  if (v.mode !== "ai") return [];
  return (project.segments ?? []).filter(
    (s) => ["none", "outdated"].includes(clipStatus(s, v)) && !isSegmentRemoved(project, s),
  );
}

// Step 15: Finalize = bring every voice clip up to date, then ask the AI director for an edit plan.
export function useFinalize(project: Project, onChange: ProjectUpdate) {
  const [state, setState] = useState<FinalizeState>({ phase: "idle" });
  const running = state.phase === "voice" || state.phase === "director";

  const run = useCallback(async () => {
    const todo = outdatedVoices(project);
    let step: "voice" | "director" = "voice";
    try {
      for (let i = 0; i < todo.length; i++) {
        setState({ phase: "voice", done: i, total: todo.length });
        onChange(await generateVoice(project.id, todo[i].id));
      }
      step = "director";
      setState({ phase: "director" });
      onChange(await runDirector(project.id));
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "error", step, message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }, [project, onChange]);

  // Edits to the plan show instantly and save after a short pause (typing fires a lot).
  const pending = useRef<DirectorContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => {
    const director = pending.current;
    pending.current = null;
    if (director) updateProject(project.id, { director }).catch(() => toast.error("Couldn't save the plan"));
  }, [project.id]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    flush();
  }, [flush]);

  const edit = useCallback(
    (change: (d: DirectorContent) => DirectorContent) => {
      if (!project.director) return;
      const next = change(project.director);
      onChange((p) => (p.director ? { ...p, director: { ...p.director, ...next } } : p));
      pending.current = {
        title: next.title,
        subtitle: next.subtitle,
        outro: next.outro,
        steps: next.steps,
        callouts: next.callouts,
        emphasis: next.emphasis,
      };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [project.director, onChange, flush],
  );

  return { state, running, run, edit };
}

export type Finalize = ReturnType<typeof useFinalize>;
