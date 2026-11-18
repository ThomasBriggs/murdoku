/** Pure quick-select helpers (SPEC §6.5.2): which cells does a row/column/room/furniture pick cover? */
import { GRID_SIZE } from '../engine/constants';
import { cellKey, type CellKey, type FurnitureType, type RoomId } from '../engine/types';

export function rowCells(r: number): CellKey[] {
  return Array.from({ length: GRID_SIZE }, (_, c) => cellKey(r, c));
}

export function colCells(c: number): CellKey[] {
  return Array.from({ length: GRID_SIZE }, (_, r) => cellKey(r, c));
}

export function roomCells(roomOf: readonly (readonly RoomId[])[], room: RoomId): CellKey[] {
  const out: CellKey[] = [];
  roomOf.forEach((row, r) => row.forEach((id, c) => id === room && out.push(cellKey(r, c))));
  return out;
}

export function furnitureCells(
  furniture: readonly (readonly (FurnitureType | null)[])[],
  type: FurnitureType,
): CellKey[] {
  const out: CellKey[] = [];
  furniture.forEach((row, r) => row.forEach((f, c) => f === type && out.push(cellKey(r, c))));
  return out;
}

export type SelectMode = 'replace' | 'add' | 'toggle';

/**
 * Combine a selection with picked cells. 'toggle' removes the picked cells when
 * all of them are already selected, otherwise adds them.
 */
export function mergeSelection(
  current: readonly CellKey[],
  picked: readonly CellKey[],
  mode: SelectMode,
): CellKey[] {
  if (mode === 'replace') return [...new Set(picked)];
  const has = new Set(current);
  if (mode === 'toggle' && picked.length > 0 && picked.every((c) => has.has(c)))
    return current.filter((c) => !picked.includes(c));
  return [...new Set([...current, ...picked])];
}
