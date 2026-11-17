import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { generateFloorPlan } from '../../src/engine/floorplan';
import { neighbours } from '../../src/engine/types';
import { SEEDS } from './helpers';

describe('generateFloorPlan', () => {
  it('is deterministic and varies with the seed', () => {
    expect(generateFloorPlan(createRng('x'))).toEqual(generateFloorPlan(createRng('x')));
    expect(generateFloorPlan(createRng('x'))).not.toEqual(generateFloorPlan(createRng('y')));
  });

  it('satisfies all invariants over 500 seeds', () => {
    for (const seed of SEEDS) {
      const { roomOf, rooms } = generateFloorPlan(createRng(seed));
      expect(rooms.length).toBeGreaterThanOrEqual(6);
      expect(rooms.length).toBeLessThanOrEqual(9);
      // full coverage: every cell belongs to exactly one room, consistent with roomOf
      let covered = 0;
      for (const room of rooms) {
        expect(room.cells.length).toBeGreaterThanOrEqual(4);
        expect(room.cells.length).toBeLessThanOrEqual(18);
        for (const { r, c } of room.cells) expect(roomOf[r]![c]).toBe(room.id);
        covered += room.cells.length;
        // contiguity (BFS)
        const keys = new Set(room.cells.map((x) => x.r * 9 + x.c));
        const seen = new Set([room.cells[0]!.r * 9 + room.cells[0]!.c]);
        const stack = [room.cells[0]!];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const n of neighbours(cur.r, cur.c)) {
            const k = n.r * 9 + n.c;
            if (keys.has(k) && !seen.has(k)) {
              seen.add(k);
              stack.push(n);
            }
          }
        }
        expect(seen.size).toBe(room.cells.length);
        // bounding-box fill ratio
        const rs = room.cells.map((x) => x.r);
        const cs = room.cells.map((x) => x.c);
        const area =
          (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1);
        expect(room.cells.length / area).toBeGreaterThanOrEqual(0.4);
      }
      expect(covered).toBe(81);
      expect(roomOf.flat().every((id) => id >= 0 && id < rooms.length)).toBe(true);
      // unique types (<= 9 rooms, 10 types), ids sequential
      expect(new Set(rooms.map((x) => x.type)).size).toBe(rooms.length);
      rooms.forEach((x, i) => expect(x.id).toBe(i));
    }
  });
});
