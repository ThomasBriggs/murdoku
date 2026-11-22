import type { RoomId } from '../engine/types';

export interface Walls {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/**
 * Per-cell wall sides: a side is a wall when the neighbouring cell belongs to a
 * different room or the side lies on the board edge.
 */
export function computeWalls(roomOf: readonly (readonly RoomId[])[]): Walls[][] {
  return roomOf.map((row, r) =>
    row.map((room, c) => ({
      top: roomOf[r - 1]?.[c] !== room,
      right: row[c + 1] !== room,
      bottom: roomOf[r + 1]?.[c] !== room,
      left: row[c - 1] !== room,
    })),
  );
}

/** A straight wall run in grid units (0..size): horizontal when y1 === y2, else vertical. */
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Interior room walls merged into maximal straight runs. The board edge is not
 * included: it is drawn as one frame around the grid.
 */
export function wallSegments(roomOf: readonly (readonly RoomId[])[]): WallSegment[] {
  const rows = roomOf.length;
  const cols = roomOf[0]?.length ?? 0;
  const out: WallSegment[] = [];
  // Horizontal lines between row y-1 and row y.
  for (let y = 1; y < rows; y++) {
    let start: number | null = null;
    for (let x = 0; x <= cols; x++) {
      const wall = x < cols && roomOf[y - 1]![x] !== roomOf[y]![x];
      if (wall && start === null) start = x;
      if (!wall && start !== null) {
        out.push({ x1: start, y1: y, x2: x, y2: y });
        start = null;
      }
    }
  }
  // Vertical lines between column x-1 and column x.
  for (let x = 1; x < cols; x++) {
    let start: number | null = null;
    for (let y = 0; y <= rows; y++) {
      const wall = y < rows && roomOf[y]![x - 1] !== roomOf[y]![x];
      if (wall && start === null) start = y;
      if (!wall && start !== null) {
        out.push({ x1: x, y1: start, x2: x, y2: y });
        start = null;
      }
    }
  }
  return out;
}

/** Row-major index of the first (top-left-most) cell of each room. */
export function firstCellOfRooms(
  roomOf: readonly (readonly RoomId[])[],
): Map<RoomId, [number, number]> {
  const out = new Map<RoomId, [number, number]>();
  roomOf.forEach((row, r) =>
    row.forEach((room, c) => {
      if (!out.has(room)) out.set(room, [r, c]);
    }),
  );
  return out;
}
