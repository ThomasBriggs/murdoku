/** Pure read-side helpers for the logic grid (SPEC §6.5.5); they only use the player's own marks. */
import { cellKey, type CellKey, type RoomId } from '../engine/types';
import type { Annotations } from './annotations';

/**
 * Cells where the person in panel slot `slot` could still be according to the
 * player's logic grid, or null when the grid has no tick in People x Rooms for
 * them (the link then shades nothing).
 *
 * A cell qualifies when its room is ticked, and its row and column are not
 * crossed; when any row (column) of that person is ticked, only ticked rows
 * (columns) qualify.
 */
export function logicPossibleCells(
  grid: Annotations['logicGrid'],
  roomOf: readonly (readonly RoomId[])[],
  slot: number,
): Set<CellKey> | null {
  const rooms = grid.rooms[slot];
  const rows = grid.rows[slot];
  const cols = grid.cols[slot];
  if (!rooms || !rows || !cols || !rooms.some((m) => m === 2)) return null;
  const rowTicked = rows.some((m) => m === 2);
  const colTicked = cols.some((m) => m === 2);
  const out = new Set<CellKey>();
  for (let r = 0; r < roomOf.length; r++) {
    if (rows[r] === 1 || (rowTicked && rows[r] !== 2)) continue;
    for (let c = 0; c < roomOf[r]!.length; c++) {
      if (cols[c] === 1 || (colTicked && cols[c] !== 2)) continue;
      if (rooms[roomOf[r]![c]!] === 2) out.add(cellKey(r, c));
    }
  }
  return out;
}
