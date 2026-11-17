import { describe, expect, it } from 'vitest';
import { build, SEEDS } from './helpers';

describe('placeSolution', () => {
  it('is deterministic and varies with the seed', () => {
    expect(build('s1').solution).toEqual(build('s1').solution);
    expect(build('s1').solution).not.toEqual(build('s2').solution);
  });

  it('satisfies the §5.3 invariants over 500 seeds', () => {
    for (const seed of SEEDS) {
      const { plan, people, solution } = build(seed);
      const { cellOf, murdererId } = solution;
      expect(cellOf).toHaveLength(9);
      expect(new Set(cellOf.map((c) => c.r)).size).toBe(9);
      expect(new Set(cellOf.map((c) => c.c)).size).toBe(9);
      const room = (id: number) => plan.roomOf[cellOf[id]!.r]![cellOf[id]!.c]!;
      const victim = people.find((p) => p.isVictim)!;
      const suspects = people.filter((p) => !p.isVictim);
      const withVictim = suspects.filter((p) => room(p.id) === room(victim.id));
      expect(withVictim.map((p) => p.id)).toEqual([murdererId]);
      expect(people[murdererId]!.isVictim).toBe(false);
      const count = (rid: number) => people.filter((p) => room(p.id) === rid).length;
      const others = suspects.filter((p) => p.id !== murdererId);
      expect(others.some((p) => count(room(p.id)) >= 2)).toBe(true);
      expect(others.some((p) => count(room(p.id)) === 1)).toBe(true);
    }
  });
});
