"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchZoomCandidates } from "@/lib/client";
import type { ZoomDetection } from "@/lib/zoom-detect";

// Step 12 (debug only): loads cached zoom candidates the first time the Debug drawer opens.
export function useZoomDetection(projectId: string, enabled: boolean) {
  const [detection, setDetection] = useState<ZoomDetection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);

  const load = useCallback(
    async (rerun: boolean) => {
      setBusy(true);
      setError(null);
      try {
        setDetection(await fetchZoomCandidates(projectId, rerun));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detection failed");
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  const loaded = detection !== null || error !== null;
  useEffect(() => {
    if (!enabled || loaded) return;
    let stop = false;
    fetchZoomCandidates(projectId)
      .then((d) => !stop && setDetection(d))
      .catch((err) => !stop && setError(err instanceof Error ? err.message : "Detection failed"));
    return () => {
      stop = true;
    };
  }, [enabled, loaded, projectId]);

  return { detection, busy, error, rerun: () => load(true), showBoxes, setShowBoxes };
}

export type ZoomDetectionState = ReturnType<typeof useZoomDetection>;
