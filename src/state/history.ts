/**
 * Generic undo/redo over snapshots of an "undoable slice" of state.
 *
 * The store decides what the slice contains (today: placements; milestones 5b/6
 * add annotations to it). Snapshots are immer-produced, so unchanged parts are
 * structurally shared and a 500-entry history stays cheap.
 */
export const HISTORY_CAP = 500;

export interface History<S> {
  past: S[];
  future: S[];
}

export function emptyHistory<S>(): History<S> {
  return { past: [], future: [] };
}

/** Record `before` as the state to return to; clears redo. Drops the oldest beyond the cap. */
export function pushHistory<S>(h: History<S>, before: S, cap = HISTORY_CAP): void {
  h.past.push(before);
  if (h.past.length > cap) h.past.splice(0, h.past.length - cap);
  h.future.length = 0;
}

/** Returns the snapshot to restore, moving `current` onto the redo stack; null if nothing to undo. */
export function popUndo<S>(h: History<S>, current: S): S | null {
  const prev = h.past.pop();
  if (prev === undefined) return null;
  h.future.push(current);
  return prev;
}

export function popRedo<S>(h: History<S>, current: S): S | null {
  const next = h.future.pop();
  if (next === undefined) return null;
  h.past.push(current);
  return next;
}
