import { ADJACENCY, GRID_SIZE } from './constants';
import type { Clue } from './clues/types';

export type Cell = { r: number; c: number }; // 0..8
export type RoomId = number;
export type PersonId = number;
export type Difficulty = 'easy' | 'medium' | 'hard';

export type RoomType =
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'study'
  | 'library'
  | 'hallway'
  | 'conservatory'
  | 'garage';

export type FurnitureType =
  | 'chair'
  | 'armchair'
  | 'sofa'
  | 'bed'
  | 'rug'
  | 'table'
  | 'plant'
  | 'bookshelf'
  | 'wardrobe'
  | 'tv'
  | 'stove'
  | 'bathtub'
  | 'piano'
  | 'car';

export interface Room {
  id: RoomId;
  type: RoomType;
  name: string;
  /** Row-major order. */
  cells: Cell[];
  /** Light-theme pastel; the dark variant lives in ROOM_TYPES[type].color.dark. */
  color: string;
}

export interface Person {
  id: PersonId;
  name: string;
  initial: string;
  color: string;
  isVictim: boolean;
}

export interface FloorPlan {
  roomOf: RoomId[][];
  rooms: Room[];
}

/** Worker-only. cellOf is indexed by PersonId. */
export interface Solution {
  cellOf: Cell[];
  murdererId: PersonId;
}

export type FurnitureGrid = (FurnitureType | null)[][];

/**
 * Cells are keyed by a single number r * GRID_SIZE + c (cheap, usable as
 * array index / bitmask position, JSON-friendly as object key).
 */
export type CellKey = number;

export function cellKey(cell: Cell): CellKey;
export function cellKey(r: number, c: number): CellKey;
export function cellKey(a: Cell | number, c?: number): CellKey {
  return typeof a === 'number' ? a * GRID_SIZE + (c as number) : a.r * GRID_SIZE + a.c;
}

export function parseCellKey(key: CellKey): Cell {
  return { r: Math.floor(key / GRID_SIZE), c: key % GRID_SIZE };
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const EIGHT: readonly (readonly [number, number])[] = [
  ...ORTHOGONAL,
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** In-bounds neighbours of a cell, honouring the ADJACENCY constant. */
export function neighbours(r: number, c: number): Cell[] {
  const mode = ADJACENCY as 'orthogonal' | 'eight'; // widened so switching the constant compiles
  const deltas = mode === 'eight' ? EIGHT : ORTHOGONAL;
  const out: Cell[] = [];
  for (const [dr, dc] of deltas) {
    if (inBounds(r + dr, c + dc)) out.push({ r: r + dr, c: c + dc });
  }
  return out;
}

/** Everything the UI may see (SPEC §9 PuzzleView without the solution hash). */
export interface Puzzle {
  version: number;
  seed: string;
  difficulty: Difficulty;
  roomOf: RoomId[][];
  rooms: Room[];
  furniture: FurnitureGrid;
  people: Person[];
  clues: Clue[];
}

export interface PuzzleView extends Puzzle {
  solutionHash: string;
}
