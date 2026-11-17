import { GRID_SIZE } from './constants';
import { ROOM_TYPES, ROOM_TYPE_IDS, sizeWeight } from './rooms';
import type { Rng } from './rng';
import { neighbours } from './types';
import type { Cell, FloorPlan, Room, RoomType } from './types';

export const MIN_ROOMS = 6;
export const MAX_ROOMS = 9;
export const MIN_ROOM_SIZE = 4;
export const MAX_ROOM_SIZE = 18;
export const MIN_FILL_RATIO = 0.4;
const MAX_ATTEMPTS = 300;

function pickSeeds(rng: Rng, n: number): Cell[] {
  const seeds: Cell[] = [];
  let minDist = 4;
  while (seeds.length < n) {
    let placed = false;
    for (let t = 0; t < 40; t++) {
      const cell = { r: rng.int(0, GRID_SIZE - 1), c: rng.int(0, GRID_SIZE - 1) };
      if (seeds.every((s) => Math.abs(s.r - cell.r) + Math.abs(s.c - cell.c) >= minDist)) {
        seeds.push(cell);
        placed = true;
        break;
      }
    }
    if (!placed) minDist = Math.max(1, minDist - 1);
  }
  return seeds;
}

/** Randomised region growing; returns owner[r][c] in 0..n-1. */
function grow(rng: Rng, n: number): number[][] {
  const owner: number[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<number>(GRID_SIZE).fill(-1),
  );
  const regions: Cell[][] = pickSeeds(rng, n).map((s, i) => {
    owner[s.r]![s.c] = i;
    return [s];
  });
  let remaining = GRID_SIZE * GRID_SIZE - n;
  while (remaining > 0) {
    const frontiers = regions.map((cells) => {
      const seen = new Set<number>();
      const out: Cell[] = [];
      for (const cell of cells) {
        for (const nb of neighbours(cell.r, cell.c)) {
          const k = nb.r * GRID_SIZE + nb.c;
          if (owner[nb.r]![nb.c] === -1 && !seen.has(k)) {
            seen.add(k);
            out.push(nb);
          }
        }
      }
      return out;
    });
    const open = regions.map((_, i) => i).filter((i) => frontiers[i]!.length > 0);
    if (open.length === 0) break; // cannot happen on a connected grid
    const i = rng.pick(open);
    const cell = rng.pick(frontiers[i]!);
    owner[cell.r]![cell.c] = i;
    regions[i]!.push(cell);
    remaining--;
  }
  return owner;
}

function boundingFill(cells: Cell[]): number {
  let r0 = GRID_SIZE,
    r1 = -1,
    c0 = GRID_SIZE,
    c1 = -1;
  for (const { r, c } of cells) {
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  }
  return cells.length / ((r1 - r0 + 1) * (c1 - c0 + 1));
}

/** 0 when valid; larger = worse. Used to pick a fallback if retries run out. */
function violation(groups: Cell[][]): number {
  let v = 0;
  for (const cells of groups) {
    if (cells.length < MIN_ROOM_SIZE) v += MIN_ROOM_SIZE - cells.length;
    if (cells.length > MAX_ROOM_SIZE) v += cells.length - MAX_ROOM_SIZE;
    const fill = boundingFill(cells);
    if (fill < MIN_FILL_RATIO) v += (MIN_FILL_RATIO - fill) * 10;
  }
  return v;
}

function groupCells(owner: number[][], n: number): Cell[][] {
  const groups: Cell[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) groups[owner[r]![c]!]!.push({ r, c });
  return groups;
}

/** Larger rooms choose first so Living Room / Library land on big regions. */
function assignTypes(rng: Rng, groups: Cell[][]): RoomType[] {
  const types: RoomType[] = new Array<RoomType>(groups.length);
  const used = new Set<RoomType>();
  const order = rng
    .shuffle(groups.map((_, i) => i))
    .sort((a, b) => groups[b]!.length - groups[a]!.length);
  for (const i of order) {
    let pool = ROOM_TYPE_IDS.filter((t) => !used.has(t));
    if (pool.length === 0) pool = ROOM_TYPE_IDS; // only if > 10 rooms
    const t = rng.weighted(pool, (type) => sizeWeight(type, groups[i]!.length));
    used.add(t);
    types[i] = t;
  }
  return types;
}

export function generateFloorPlan(rng: Rng): FloorPlan {
  let best: { owner: number[][]; n: number; score: number } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const r = rng.fork(`plan-${attempt}`);
    const n = r.int(MIN_ROOMS, MAX_ROOMS);
    const owner = grow(r, n);
    const score = violation(groupCells(owner, n));
    if (best === null || score < best.score) best = { owner, n, score };
    if (score === 0) break;
  }
  const { owner, n } = best!;
  const groups = groupCells(owner, n);
  const types = assignTypes(rng.fork('types'), groups);
  const rooms: Room[] = groups.map((cells, id) => {
    const type = types[id]!;
    return { id, type, name: ROOM_TYPES[type].name, cells, color: ROOM_TYPES[type].color.light };
  });
  return { roomOf: owner, rooms };
}
