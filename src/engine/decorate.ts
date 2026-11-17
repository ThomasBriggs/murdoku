import { GRID_SIZE } from './constants';
import { canPlaceIn, isOccupiable } from './furniture';
import { ROOM_TYPES } from './rooms';
import type { Rng } from './rng';
import { neighbours } from './types';
import type { Cell, FloorPlan, FurnitureGrid, FurnitureType, RoomId, Solution } from './types';

/** Fraction range of non-person cells that receive blocking furniture. */
export const BLOCKING_RATIO = { min: 0.22, max: 0.28 } as const;
const DECOY_CHANCE = 0.1;
const CHAIR_BY_TABLE_CHANCE = 0.7;

const MAX_PER_ROOM: Partial<Record<FurnitureType, number>> = {
  bathtub: 1,
  piano: 1,
  tv: 1,
  car: 2,
  stove: 2,
  wardrobe: 2,
};
const WALL_HUGGERS = new Set<FurnitureType>([
  'bookshelf',
  'wardrobe',
  'tv',
  'stove',
  'bathtub',
  'piano',
]);
const OCCUPIABLE_WEIGHT: Record<string, number> = {
  bed: 4,
  sofa: 3,
  armchair: 2,
  chair: 2,
  rug: 1,
};

export function decorate(rng: Rng, plan: FloorPlan, solution: Solution): FurnitureGrid {
  const grid: FurnitureGrid = Array.from({ length: GRID_SIZE }, () =>
    Array<FurnitureType | null>(GRID_SIZE).fill(null),
  );
  const isPerson: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<boolean>(GRID_SIZE).fill(false),
  );
  for (const { r, c } of solution.cellOf) isPerson[r]![c] = true;
  const roomAt = (r: number, c: number): RoomId => plan.roomOf[r]![c]!;
  const free = (cell: Cell) => grid[cell.r]![cell.c] === null && !isPerson[cell.r]![cell.c];
  const nextToTable = (cell: Cell) =>
    neighbours(cell.r, cell.c).some(
      (n) => roomAt(n.r, n.c) === roomAt(cell.r, cell.c) && grid[n.r]![n.c] === 'table',
    );
  const isBoundary = (cell: Cell) =>
    neighbours(cell.r, cell.c).length < 4 ||
    neighbours(cell.r, cell.c).some((n) => roomAt(n.r, n.c) !== roomAt(cell.r, cell.c));

  const pickOccupiable = (cell: Cell): FurnitureType => {
    const room = plan.rooms[roomAt(cell.r, cell.c)]!;
    const options = ROOM_TYPES[room.type].palette.occupiable.filter((t) =>
      canPlaceIn(t, room.type),
    );
    const near = nextToTable(cell);
    return rng.weighted(
      options,
      (t) => (OCCUPIABLE_WEIGHT[t] ?? 1) * (t === 'chair' && near ? 4 : 1),
    );
  };

  // 1. Blocking furniture, quota per room proportional to its non-person cells.
  const freeByRoom = plan.rooms.map((room) =>
    room.cells.filter((cell) => !isPerson[cell.r]![cell.c]),
  );
  const totalFree = freeByRoom.reduce((a, cells) => a + cells.length, 0);
  const total = Math.round(
    totalFree *
      (rng.int(Math.round(BLOCKING_RATIO.min * 100), Math.round(BLOCKING_RATIO.max * 100)) / 100),
  );
  const raw = freeByRoom.map((cells) => (total * cells.length) / totalFree);
  const quota = raw.map((x, i) => Math.min(freeByRoom[i]!.length, Math.max(1, Math.floor(x))));
  const sum = () => quota.reduce((a, b) => a + b, 0);
  const idx = plan.rooms.map((_, i) => i);
  while (sum() < total) {
    const cand = idx.filter((i) => quota[i]! < freeByRoom[i]!.length);
    if (cand.length === 0) break;
    const i = rng.weighted(cand, (j) => Math.max(0.01, raw[j]! - quota[j]! + 0.5));
    quota[i] = quota[i]! + 1;
  }
  while (sum() > total) {
    const cand = idx.filter((i) => quota[i]! > 1);
    if (cand.length === 0) break;
    const i = rng.weighted(cand, (j) => Math.max(0.01, quota[j]! - raw[j]! + 0.5));
    quota[i] = quota[i]! - 1;
  }

  for (const room of plan.rooms) {
    const palette = ROOM_TYPES[room.type].palette.blocking;
    const counts = new Map<FurnitureType, number>();
    for (let k = 0; k < quota[room.id]!; k++) {
      const options = palette.filter((t) => (counts.get(t) ?? 0) < (MAX_PER_ROOM[t] ?? Infinity));
      const type = rng.weighted(
        options,
        (t) => (t === 'plant' ? 0.7 : 1) / (1 + (counts.get(t) ?? 0)),
      );
      const cells = freeByRoom[room.id]!.filter(free);
      const cell = rng.weighted(cells, (cl) => (WALL_HUGGERS.has(type) && isBoundary(cl) ? 3 : 1));
      grid[cell.r]![cell.c] = type;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }

  // 2. Occupiable furniture under 4-5 of the 9 people (~40-60%).
  const underCount = rng.int(4, 5);
  for (const pid of rng.shuffle(solution.cellOf.map((_, i) => i)).slice(0, underCount)) {
    const cell = solution.cellOf[pid]!;
    grid[cell.r]![cell.c] = pickOccupiable(cell);
  }

  // 3. Chairs beside tables, then random decoys.
  const tables: Cell[] = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) if (grid[r]![c] === 'table') tables.push({ r, c });
  for (const t of rng.shuffle(tables)) {
    const room = plan.rooms[roomAt(t.r, t.c)]!;
    if (!canPlaceIn('chair', room.type) || rng.next() >= CHAIR_BY_TABLE_CHANCE) continue;
    const spots = neighbours(t.r, t.c).filter((n) => roomAt(n.r, n.c) === room.id && free(n));
    if (spots.length > 0) {
      const s = rng.pick(spots);
      grid[s.r]![s.c] = 'chair';
    }
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = { r, c };
      if (free(cell) && rng.next() < DECOY_CHANCE) {
        const t = pickOccupiable(cell);
        if (isOccupiable(t)) grid[r]![c] = t;
      }
    }
  }
  return grid;
}
