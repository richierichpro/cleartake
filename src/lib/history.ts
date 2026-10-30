import type { Project } from "./types";

// Undo / redo for the editor. A step is a snapshot of everything you edit; the rest of the project
// (status, export, transcript info) is never undone. Generated voice clips stay on disk, so undoing
// past a regenerated voice and redoing it again costs nothing.

export const EDITABLE = ["segments", "cuts", "trim", "splits", "zooms", "visuals", "captions", "director", "scenes", "voice", "music"] as const;
export type EditableKey = (typeof EDITABLE)[number];
export type Snapshot = Pick<Project, EditableKey>;

export const HISTORY_CONFIG = {
  coalesce: 800, // ms: changes this close together are one step (a burst of typing, a drag)
  limit: 100, // steps kept
};

export const snapshotOf = (p: Project): Snapshot => Object.fromEntries(EDITABLE.map((k) => [k, p[k]])) as Snapshot;
const keyOf = (p: Project) => JSON.stringify(snapshotOf(p));

export interface HistoryState {
  project: Project | null | "missing";
  past: Snapshot[];
  future: Snapshot[];
  lastAt: number; // when the last step was recorded
  restored: Snapshot | null; // set by undo/redo: what to save to the server
}

export type HistoryAction =
  | { type: "load"; project: Project | "missing" }
  | { type: "set"; next: Project | ((prev: Project) => Project); at: number }
  | { type: "undo" }
  | { type: "redo" };

export const initialHistory: HistoryState = { project: null, past: [], future: [], lastAt: 0, restored: null };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  const prev = state.project;
  switch (action.type) {
    case "load":
      return { ...initialHistory, project: action.project };
    case "set": {
      if (!prev || prev === "missing") return state;
      const next = typeof action.next === "function" ? action.next(prev) : action.next;
      if (keyOf(next) === keyOf(prev)) return { ...state, project: next }; // nothing editable changed
      const merge = state.past.length > 0 && action.at - state.lastAt < HISTORY_CONFIG.coalesce;
      return {
        ...state,
        project: next,
        past: merge ? state.past : [...state.past, snapshotOf(prev)].slice(-HISTORY_CONFIG.limit),
        future: [],
        lastAt: action.at,
      };
    }
    case "undo":
    case "redo": {
      const from = action.type === "undo" ? state.past : state.future;
      if (!prev || prev === "missing" || !from.length) return state;
      const snap = from[from.length - 1];
      const here = snapshotOf(prev);
      return {
        project: { ...prev, ...snap },
        past: action.type === "undo" ? state.past.slice(0, -1) : [...state.past, here],
        future: action.type === "undo" ? [...state.future, here] : state.future.slice(0, -1),
        lastAt: 0, // the next edit starts a new step
        restored: snap,
      };
    }
  }
}
