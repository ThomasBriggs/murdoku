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
