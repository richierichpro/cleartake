"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { analyzeActivity, fetchPlanInputs } from "@/lib/client";
import { buildSyncPlan, type Motion } from "@/lib/sync";
import type { Project, TranscriptWord } from "@/lib/types";

/**
 * The sync plan is derived, never stored: recomputed from project.json + motion + transcript
 * whenever the project changes, so it always reflects the latest script, voice and settings.
 */
export function useSyncPlan(project: Project) {
  const [inputs, setInputs] = useState<{ motion: Motion | null; words: TranscriptWord[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { id, status } = project;

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const motion = await analyzeActivity(id);
      setInputs((prev) => ({ words: prev?.words ?? [], motion }));
    } catch (err) {
      toast.error("Couldn't analyze screen activity", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAnalyzing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPlanInputs(id).then((loaded) => {
      setInputs(loaded);
      // Projects processed before Step 6: analyze once (local ffmpeg, free).
      if (!loaded.motion && status === "ready") analyze();
    });
  }, [id, status, analyze]);

  const plan = useMemo(
    () => (inputs?.motion ? buildSyncPlan(project, inputs.words, inputs.motion) : null),
    [project, inputs],
  );
  return { plan, analyzing, analyze };
}
