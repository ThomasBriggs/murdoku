import { GRID_SIZE } from './constants';
import type { Cell } from './types';

/**
 * Compact set of board cells: one Uint16Array of GRID_SIZE row masks, where
 * bit c of entry r means cell (r, c) is in the set. 18 bytes, branch-free
 * intersection/union, and the same shape the solvers use for candidates.
 */
export type CellSet = Uint16Array<ArrayBuffer>;

export const ROW_FULL = (1 << GRID_SIZE) - 1;

export const POPCOUNT = new Uint8Array(1 << GRID_SIZE);
for (let i = 1; i < POPCOUNT.length; i++) POPCOUNT[i] = POPCOUNT[i >> 1]! + (i & 1);

export function popcount(mask: number): number {
  return POPCOUNT[mask]!;
}

/** Index of the lowest set bit of a non-zero mask. */
export function lowBit(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}

export function newCellSet(): CellSet {
  return new Uint16Array(GRID_SIZE);
}

export function fullCellSet(): CellSet {
  return new Uint16Array(GRID_SIZE).fill(ROW_FULL);
}

export function setHas(s: CellSet, r: number, c: number): boolean {
  return (s[r]! & (1 << c)) !== 0;
}

export function setAdd(s: CellSet, r: number, c: number): void {
  s[r] = s[r]! | (1 << c);
}

export function setCount(s: CellSet): number {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++) n += POPCOUNT[s[r]!]!;
  return n;
}

export function setCells(s: CellSet): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) if (s[r]! & (1 << c)) out.push({ r, c });
  return out;
}

export function setIntersect(a: CellSet, b: CellSet): CellSet {
  const out = newCellSet();
  for (let r = 0; r < GRID_SIZE; r++) out[r] = a[r]! & b[r]!;
  return out;
}

export function setEquals(a: CellSet, b: CellSet): boolean {
  for (let r = 0; r < GRID_SIZE; r++) if (a[r] !== b[r]) return false;
  return true;
}

/** "C4": column letter A-I then row number 1-9 (SPEC §12). */
export function cellLabel(cell: Cell): string {
  return `${'ABCDEFGHI'.charAt(cell.c)}${cell.r + 1}`;
}
