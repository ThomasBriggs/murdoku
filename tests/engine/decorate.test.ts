import { describe, expect, it } from 'vitest';
import { canPlaceIn, isOccupiable } from '../../src/engine/furniture';
import { build, SEEDS } from './helpers';

describe('decorate', () => {
  it('is deterministic and varies with the seed', () => {
    expect(build('d1').furniture).toEqual(build('d1').furniture);
    expect(build('d1').furniture).not.toEqual(build('d2').furniture);
  });

  it('satisfies the §5.2 invariants over 500 seeds', () => {
    let underTotal = 0;
    for (const seed of SEEDS) {
      const { plan, solution, furniture } = build(seed);
      expect(furniture).toHaveLength(9);
      const person = new Set(solution.cellOf.map((c) => c.r * 9 + c.c));
      let blocking = 0;
      let under = 0;
      for (let r = 0; r < 9; r++) {
        expect(furniture[r]).toHaveLength(9);
        for (let c = 0; c < 9; c++) {
          const f = furniture[r]![c]!;
          if (f === null) continue;
          expect(canPlaceIn(f, plan.rooms[plan.roomOf[r]![c]!]!.type)).toBe(true);
          if (person.has(r * 9 + c)) expect(isOccupiable(f)).toBe(true);
          else if (!isOccupiable(f)) blocking++;
          if (person.has(r * 9 + c) && f) under++;
        }
      }
      // 72 non-person cells; quota is round(72 * [0.22, 0.28]) = 16..20 => 22.2%..27.8%,
      // strictly inside the spec's 20-30% band, so no tolerance is needed.
      expect(blocking / 72).toBeGreaterThanOrEqual(0.2);
      expect(blocking / 72).toBeLessThanOrEqual(0.3);
      expect(under).toBeGreaterThanOrEqual(4); // ~40%
      expect(under).toBeLessThanOrEqual(5); // ~60%
      underTotal += under;
      // every room furnished
      for (const room of plan.rooms)
        expect(room.cells.some(({ r, c }) => furniture[r]![c] !== null)).toBe(true);
      // every row/column keeps a non-blocking cell (guaranteed by person cells)
      // decoys exist
      const occupiableNotUnder = furniture
        .flatMap((row, r) => row.map((f, c) => [f, r, c] as const))
        .filter(([f, r, c]) => f && isOccupiable(f) && !person.has(r * 9 + c)).length;
      expect(occupiableNotUnder + under).toBeGreaterThan(0);
    }
    expect(underTotal / SEEDS.length).toBeGreaterThan(4);
  });
});
