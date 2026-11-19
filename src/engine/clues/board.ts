import { GRID_SIZE } from '../constants';
import { FURNITURE_TYPES, isOccupiable } from '../furniture';
import { type CellSet, newCellSet, setAdd, setCount, setEquals, setIntersect } from '../cellset';
import { neighbours } from '../types';
import type { FurnitureGrid, FurnitureType, Room, RoomId } from '../types';
import { atomKey } from './atoms';
import type { Atom } from './types';

/** The static part of a puzzle: everything that does not depend on people or clues. */
export interface BoardSource {
  roomOf: RoomId[][];
  rooms: Room[];
  furniture: FurnitureGrid;
}

/**
 * Pre-computed per-cell facts about a board.
 *
 * Wall definition: a side of a cell is a "wall" if it is the edge of the grid
 * or the neighbouring cell on that side belongs to a different room.
 *  - roomCorner: walls on two perpendicular sides (one of up/down AND one of left/right).
 *  - roomEdge:   at least one wall side, but not a corner.
 */
export interface Board {
  source: BoardSource;
  /** Room id of cell r*9+c. */
  roomAt: Int8Array;
  furnAt: (FurnitureType | null)[];
  /** Cells a person may stand on (not blocked by furniture). */
  free: CellSet;
  roomSets: CellSet[];
  onSets: Partial<Record<FurnitureType, CellSet>>;
  besideSets: Partial<Record<FurnitureType, CellSet>>;
  corner: CellSet;
  edge: CellSet;
  /** Furniture types present anywhere on the board. */
  present: FurnitureType[];
  atomCache: Map<string, CellSet>;
}

const cache = new WeakMap<object, Board>();

/**
 * Board for a puzzle. Cached on the identity of `roomOf`, so every clue
 * variation of the same layout shares one Board (the generator relies on it).
 */
export function getBoard(source: BoardSource): Board {
  const hit = cache.get(source.roomOf);
  if (hit && hit.source.furniture === source.furniture) return hit;
  const board = buildBoard(source);
  cache.set(source.roomOf, board);
  return board;
}

export function buildBoard(source: BoardSource): Board {
  const { roomOf, rooms, furniture } = source;
  const roomAt = new Int8Array(GRID_SIZE * GRID_SIZE);
  const furnAt: (FurnitureType | null)[] = new Array(GRID_SIZE * GRID_SIZE).fill(null);
  const free = newCellSet();
  const roomSets = rooms.map(() => newCellSet());
  const onSets: Board['onSets'] = {};
  const besideSets: Board['besideSets'] = {};
  const corner = newCellSet();
  const edge = newCellSet();
  const presentSet = new Set<FurnitureType>();

  const wall = (r: number, c: number, dr: number, dc: number) => {
    const rr = r + dr;
    const cc = c + dc;
    return (
      rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE || roomOf[rr]![cc] !== roomOf[r]![c]
    );
  };

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const k = r * GRID_SIZE + c;
      roomAt[k] = roomOf[r]![c]!;
      const f = furniture[r]![c] ?? null;
      furnAt[k] = f;
      setAdd(roomSets[roomOf[r]![c]!]!, r, c);
      if (f === null || isOccupiable(f)) setAdd(free, r, c);
      if (f !== null) {
        presentSet.add(f);
        setAdd((onSets[f] ??= newCellSet()), r, c);
        // Beside counts only within the same room: walls separate.
        for (const n of neighbours(r, c))
          if (roomOf[n.r]![n.c] === roomOf[r]![c])
            setAdd((besideSets[f] ??= newCellSet()), n.r, n.c);
      }
      const vert = wall(r, c, -1, 0) || wall(r, c, 1, 0);
      const horiz = wall(r, c, 0, -1) || wall(r, c, 0, 1);
      if (vert && horiz) setAdd(corner, r, c);
      else if (vert || horiz) setAdd(edge, r, c);
    }
  }
  // beside-sets above only mark neighbours of present types; keep on-sets of
  // blocking types empty of people by intersecting with `free` at use time.
  const present = FURNITURE_TYPES.filter((t) => presentSet.has(t));
  return {
    source,
    roomAt,
    furnAt,
    free,
    roomSets,
    onSets,
    besideSets,
    corner,
    edge,
    present,
    atomCache: new Map(),
  };
}

function complement(s: CellSet): CellSet {
  const out = newCellSet();
  for (let r = 0; r < GRID_SIZE; r++) out[r] = ~s[r]! & ((1 << GRID_SIZE) - 1);
  return out;
}

/**
 * Cells (among free cells) where a cell-only atom holds. Returns null for the
 * relational atoms (`alone`, `sameRoomAs`). The result is cached: never mutate it.
 */
export function atomCells(board: Board, atom: Atom): CellSet | null {
  if (atom.kind === 'alone' || atom.kind === 'sameRoomAs') return null;
  const key = atomKey(atom);
  const hit = board.atomCache.get(key);
  if (hit) return hit;
  let raw: CellSet;
  const empty = newCellSet();
  switch (atom.kind) {
    case 'inRoom':
      raw = board.roomSets[atom.room] ?? empty;
      break;
    case 'notInRoom':
      raw = complement(board.roomSets[atom.room] ?? empty);
      break;
    case 'on':
      raw = board.onSets[atom.furniture] ?? empty;
      break;
    case 'beside':
      raw = board.besideSets[atom.furniture] ?? empty;
      break;
    case 'notBeside':
      raw = complement(board.besideSets[atom.furniture] ?? empty);
      break;
    case 'row':
      raw = newCellSet();
      raw[atom.index] = (1 << GRID_SIZE) - 1;
      break;
    case 'col':
      raw = newCellSet();
      for (let r = 0; r < GRID_SIZE; r++) raw[r] = 1 << atom.index;
      break;
    case 'roomCorner':
      raw = board.corner;
      break;
    case 'roomEdge':
      raw = board.edge;
      break;
  }
  const out = setIntersect(raw, board.free);
  board.atomCache.set(key, out);
  return out;
}

/** Free cells satisfying every static atom of a list (relational atoms are ignored). */
export function staticCandidates(board: Board, atoms: readonly Atom[]): CellSet {
  let acc = board.free.slice();
  for (const a of atoms) {
    const s = atomCells(board, a);
    if (s) acc = setIntersect(acc, s);
  }
  return acc;
}

/** True if a cell-only atom excludes no free cell (carries no information). */
export function isVacuous(board: Board, atom: Atom): boolean {
  const s = atomCells(board, atom);
  return s !== null && setEquals(s, board.free);
}

export function freeCount(board: Board): number {
  return setCount(board.free);
}
