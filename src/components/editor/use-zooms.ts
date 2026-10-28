"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchZoomCandidates, updateProject } from "@/lib/client";
import { outputToSource, sourceToOutput, type SyncPlan } from "@/lib/sync";
import { fitsBetween, newZoomId, outputZooms, ZOOM_LIMITS, zoomFromSuggestion, zoomsOf } from "@/lib/zooms";
import type { Project, Zoom } from "@/lib/types";
import type { ProjectUpdate } from "./editor";

// Step 13: zoom editing. Zooms are stored in source time; the timeline works in output time.
export function useZooms(
  project: Project,
  plan: SyncPlan,
  onChange: ProjectUpdate,
  onSelect?: (outputStart: number | null) => void, // e.g. open the Zooms tab and jump into the zoom to aim it
) {
  const [selectedId, setSelected] = useState<string | null>(null);
  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (!id) return;
      const z = (project.zooms?.items ?? []).find((x) => x.id === id);
      onSelect?.(z ? sourceToOutput(plan, z.start) : null);
    },
    [onSelect, project.zooms, plan],
  );
  const [detecting, setDetecting] = useState(false);
  const { enabled, items } = zoomsOf(project);

  const save = useCallback(
    (next: { enabled?: boolean; items?: Zoom[] }) => {
      onChange((p) => ({ ...p, zooms: { ...zoomsOf(p), ...next } }));
      updateProject(project.id, { zooms: next }).catch(() => toast.error("Couldn't save zooms"));
    },
    [onChange, project.id],
  );

  // Every zoom in output time (including disabled ones), for the timeline.
  const timeline = useMemo(
    () => items.map((z) => ({ ...z, outStart: sourceToOutput(plan, z.start), outEnd: sourceToOutput(plan, z.end) })),
    [items, plan],
  );
  const asOutput = timeline.map((z) => ({ id: z.id, start: z.outStart, end: z.outEnd }));

  /** Adds a zoom starting at output time `t`; refuses if it would be within 3s of another. */
  const addAt = useCallback(
    (t: number) => {
      const start = Math.max(0, Math.min(t, plan.outputDuration - ZOOM_LIMITS.minLength));
      const end = Math.min(plan.outputDuration, start + ZOOM_LIMITS.defaultLength);
      if (!fitsBetween(asOutput, start, end)) {
        return toast("Too close to another zoom", { description: `Keep zooms at least ${ZOOM_LIMITS.minGap}s apart.` });
      }
      const zoom: Zoom = {
        id: newZoomId(),
        start: outputToSource(plan, start),
        end: outputToSource(plan, end),
        x: 0.5,
        y: 0.5,
        scale: ZOOM_LIMITS.defaultScale,
        enabled: true,
      };
      save({ items: [...items, zoom], enabled: true });
      setSelectedId(zoom.id);
      toast("Zoom added", { description: "Click on the video to choose where it zooms in." });
    },
    [plan, asOutput, items, save, setSelectedId],
  );

  const update = useCallback(
    (id: string, patch: Partial<Zoom>) => save({ items: items.map((z) => (z.id === id ? { ...z, ...patch } : z)) }),
    [items, save],
  );

  /** Moves/resizes in output time, clamped to the 3s gap and the video length. */
  const setRange = useCallback(
    (id: string, start: number, end: number) => {
      const s = Math.max(0, start);
      const e = Math.min(plan.outputDuration, Math.max(s + ZOOM_LIMITS.minLength, end));
      if (!fitsBetween(asOutput, s, e, id)) return false;
      update(id, { start: outputToSource(plan, s), end: outputToSource(plan, e) });
      return true;
    },
    [plan, asOutput, update],
  );

  const remove = useCallback(
    (id: string) => {
      const before = items;
      save({ items: items.filter((z) => z.id !== id) });
      if (selectedId === id) setSelectedId(null);
      toast("Zoom removed", { action: { label: "Undo", onClick: () => save({ items: before }) } });
    },
    [items, save, selectedId, setSelectedId],
  );

  /** Turns Step 12 suggestions into zooms (only when you ask), skipping ones too close to existing zooms. */
  const autoDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const { candidates } = await fetchZoomCandidates(project.id);
      const added: Zoom[] = [];
      const taken = [...asOutput];
      for (const c of candidates) {
        const z = zoomFromSuggestion(c);
        const out = { id: z.id, start: sourceToOutput(plan, z.start), end: sourceToOutput(plan, z.end) };
        // Sped-up paragraphs compress source time: keep at least defaultLength in the edited video.
        if (out.end - out.start < ZOOM_LIMITS.defaultLength) {
          out.end = Math.min(plan.outputDuration, out.start + ZOOM_LIMITS.defaultLength);
          z.end = outputToSource(plan, out.end);
        }
        if (out.end - out.start < 0.5 || !fitsBetween(taken, out.start, out.end)) continue;
        taken.push(out);
        added.push(z);
      }
      if (!added.length) {
        toast("No new zooms found", {
          description: candidates.length
            ? "The suggestions overlap zooms you already have."
            : "Name what you click in your narration (“click Settings”) to get automatic zooms, or add them by hand.",
        });
        return;
      }
      const before = items;
      save({ items: [...items, ...added], enabled: true });
      setSelectedId(null);
      toast.success(`Added ${added.length} zoom${added.length > 1 ? "s" : ""}`, {
        action: { label: "Undo", onClick: () => save({ items: before }) },
      });
    } catch (err) {
      toast.error("Couldn't detect zooms", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDetecting(false);
    }
  }, [project.id, plan, asOutput, items, save, setSelectedId]);

  const selected = items.find((z) => z.id === selectedId) ?? null;

  return {
    enabled,
    items,
    timeline,
    selected,
    selectedId,
    select: setSelectedId,
    setEnabled: (on: boolean) => save({ enabled: on }),
    addAt,
    update,
    setRange,
    remove,
    autoDetect,
    detecting,
    /** What the Player plays: the selected zoom is left out so you can aim it on the full frame. */
    playing: outputZooms(project, plan, selectedId),
  };
}

export type Zooms = ReturnType<typeof useZooms>;
