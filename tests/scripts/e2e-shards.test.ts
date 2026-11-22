import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHT, WEIGHTS, listSpecs, splitSpecs } from '../../scripts/e2e-shards.mjs';

const real = listSpecs();

describe('e2e shards', () => {
  for (const total of [1, 3, 4]) {
    it(`puts every spec in exactly one of ${total} shards, without screenshots`, () => {
      const all = splitSpecs(real, total).flatMap((s) => s.specs);
      const expected = real.filter((p) => !p.endsWith('screenshots.cy.ts'));
      expect([...all].sort()).toEqual(expected);
      expect(new Set(all).size).toBe(all.length);
    });
  }

  it('is deterministic regardless of input order', () => {
    expect(splitSpecs([...real].reverse(), 3)).toEqual(splitSpecs(real, 3));
  });

  it('balances: heaviest shard is within the largest spec of the average', () => {
    const shards = splitSpecs(real, 3);
    const total = shards.reduce((n, s) => n + s.weight, 0);
    const max = Math.max(...shards.map((s) => s.weight));
    expect(max).toBeLessThanOrEqual(Math.max(total / 3, ...Object.values(WEIGHTS)) + 1);
  });

  it('gives unknown specs the default weight', () => {
    const shards = splitSpecs(['cypress/e2e/brand-new.cy.ts'], 2);
    expect(shards.map((s) => s.weight).sort()).toEqual([0, DEFAULT_WEIGHT]);
  });
});
