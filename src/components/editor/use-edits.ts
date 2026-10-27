"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { updateProject } from "@/lib/client";
import { newCutId, type Range } from "@/lib/edits";
import { outputToSource, type SyncPlan } from "@/lib/sync";
import type { Cut, Project } from "@/lib/types";
import type { ProjectUpdate } from "./editor";

// Trim / split / cut actions (Step 9). Everything is source time and saved right away;
// the local project updates first so the preview reacts instantly.
export function useEdits(project: Project, plan: SyncPlan, onChange: ProjectUpdate, currentTime: number) {
  const [selection, setSelection] = useState<Range | null>(null);
  const duration = project.video.duration;

  const save = useCallback(
    (patch: { cuts?: Cut[]; trim?: Project["trim"] | null; splits?: number[] }) => {
      onChange((p) => {
        const next = { ...p, ...patch } as Project;
        if (patch.trim === null) delete next.trim;
        return next;
      });
      updateProject(project.id, { edit: patch }).catch(() => toast.error("Couldn't save your edit"));
    },
    [onChange, project.id],
  );

  const cuts = useMemo(() => project.cuts ?? [], [project.cuts]);

  const split = useCallback(() => {
    const t = outputToSource(plan, currentTime);
    if (t <= 0.05 || t >= duration - 0.05) return;
    const splits = project.splits ?? [];
    if (splits.some((s) => Math.abs(s - t) < 0.05)) return;
    save({ splits: [...splits, t].sort((a, b) => a - b) });
    toast("Split at playhead", { description: "Click a piece on the video track, then press Delete to cut it." });
  }, [plan, currentTime, duration, project.splits, save]);

  const cutSelection = useCallback(() => {
    if (!selection) return;
    const cut: Cut = { id: newCutId(), start: selection.start, end: selection.end };
    save({ cuts: [...cuts, cut] });
    setSelection(null);
    toast(`Cut ${(cut.end - cut.start).toFixed(1)}s`, {
      description: "The paragraph's voice still plays, so its remaining video is retimed to fit. Click ✂ on the timeline to restore.",
      action: { label: "Undo", onClick: () => save({ cuts: (project.cuts ?? []).filter((c) => c.id !== cut.id) }) },
    });
  }, [selection, cuts, save, project.cuts]);

  const restoreCut = useCallback(
    (id: string) => {
      const cut = cuts.find((c) => c.id === id);
      save({ cuts: cuts.filter((c) => c.id !== id) });
      if (cut) toast(`Restored ${(cut.end - cut.start).toFixed(1)}s`, { action: { label: "Undo", onClick: () => save({ cuts }) } });
    },
    [cuts, save],
  );

  const setTrim = useCallback(
    (trim: { start: number; end: number }) => {
      const before = project.trim ?? null;
      const clean = { start: Math.max(0, trim.start), end: Math.min(duration, trim.end) };
      if (clean.end - clean.start < 0.5) return toast.error("Keep at least half a second of video");
      save({ trim: clean.start <= 0.01 && clean.end >= duration - 0.01 ? null : clean });
      toast("Trimmed", { action: { label: "Undo", onClick: () => save({ trim: before }) } });
    },
    [project.trim, duration, save],
  );

  return { selection, setSelection, split, cutSelection, restoreCut, setTrim, cuts, splits: project.splits ?? [], trim: project.trim };
}

export type Edits = ReturnType<typeof useEdits>;
