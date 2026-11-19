import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { ELLIE, ELLIE_COLOR, NAME_POOL, TOKEN_COLORS, pickPeople } from '../../src/engine/names';
import { SEEDS } from './helpers';

describe('pickPeople', () => {
  it('has a pool of ~40 names', () => {
    expect(NAME_POOL.length).toBeGreaterThanOrEqual(40);
    expect(new Set(NAME_POOL).size).toBe(NAME_POOL.length);
  });

  it('is deterministic', () => {
    expect(pickPeople(createRng('p'))).toEqual(pickPeople(createRng('p')));
    expect(pickPeople(createRng('p'))).not.toEqual(pickPeople(createRng('q')));
  });

  it('gives 9 people, distinct initials/colours/names, exactly one victim (500 seeds)', () => {
    for (const seed of SEEDS) {
      const people = pickPeople(createRng(seed));
      expect(people).toHaveLength(9);
      expect(new Set(people.map((p) => p.initial)).size).toBe(9);
      expect(new Set(people.map((p) => p.color)).size).toBe(9);
      expect(new Set(people.map((p) => p.name)).size).toBe(9);
      expect(people.filter((p) => p.isVictim)).toHaveLength(1);
      people.forEach((p, i) => {
        expect(p.id).toBe(i);
        expect(p.initial).toBe(p.name[0]);
      });
    }
  });

  it('always makes Ellie orange (easter egg)', () => {
    expect(TOKEN_COLORS).toContain(ELLIE_COLOR);
    expect(NAME_POOL.some((n) => n.startsWith(ELLIE))).toBe(true);
    let seen = 0;
    for (let i = 0; i < 2000; i++) {
      const people = pickPeople(createRng(`ellie-${i}`));
      const ellie = people.find((p) => p.name.startsWith(ELLIE));
      if (!ellie) continue;
      seen++;
      expect(ellie.color).toBe(ELLIE_COLOR);
      expect(people.filter((p) => p.color === ELLIE_COLOR)).toHaveLength(1);
    }
    expect(seen).toBeGreaterThan(50);
  });
});
