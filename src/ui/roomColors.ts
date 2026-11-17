import type { Room, RoomId } from '../engine/types';

export interface RoomColor {
  light: string;
  dark: string;
}

const MAX_HUES = 12;

/**
 * One evenly spaced hue per room (up to 12 distinct hues around the wheel), so a
 * board with few rooms gets widely separated colours. Lightness is shared so
 * icons and tokens read equally everywhere.
 */
function hueWheel(count: number): number[] {
  const n = Math.min(MAX_HUES, Math.max(4, count));
  return Array.from({ length: n }, (_, i) => Math.round((i * 360) / n));
}

const toColor = (h: number): RoomColor => ({
  light: `hsl(${h} 70% 80%)`,
  dark: `hsl(${h} 45% 30%)`,
});

const dist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/**
 * Deterministic greedy colouring: rooms in id order each take the unused hue
 * (least-used when more rooms than hues) farthest from the hues of adjacent
 * rooms, so neighbours never look alike.
 */
export function assignRoomColors(
  rooms: readonly Room[],
  roomOf: readonly (readonly RoomId[])[],
): Map<RoomId, RoomColor> {
  const adj = new Map<RoomId, Set<RoomId>>(rooms.map((r) => [r.id, new Set()]));
  roomOf.forEach((row, r) =>
    row.forEach((id, c) => {
      for (const other of [row[c + 1], roomOf[r + 1]?.[c]])
        if (other !== undefined && other !== id) {
          adj.get(id)?.add(other);
          adj.get(other)?.add(id);
        }
    }),
  );
  const HUES = hueWheel(rooms.length);
  const hueOf = new Map<RoomId, number>();
  const uses = new Map<number, number>();
  for (const room of rooms) {
    const near = [...(adj.get(room.id) ?? [])]
      .map((n) => hueOf.get(n))
      .filter((h): h is number => h !== undefined);
    const minDist = (h: number, others: number[]) =>
      others.length ? Math.min(...others.map((n) => dist(h, n))) : 0;
    const assigned = [...hueOf.values()];
    let best = HUES[0]!;
    let bestKey = [Infinity, 0, 0];
    for (const h of HUES) {
      // fewest uses, then farthest from neighbours, then farthest from any assigned room
      const key = [uses.get(h) ?? 0, -Math.min(minDist(h, near), 120), -minDist(h, assigned)];
      if (
        key[0]! < bestKey[0]! ||
        (key[0] === bestKey[0] &&
          (key[1]! < bestKey[1]! || (key[1] === bestKey[1] && key[2]! < bestKey[2]!)))
      ) {
        best = h;
        bestKey = key;
      }
    }
    hueOf.set(room.id, best);
    uses.set(best, (uses.get(best) ?? 0) + 1);
  }
  return new Map([...hueOf].map(([id, h]) => [id, toColor(h)]));
}
