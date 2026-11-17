import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';

const take = (seed: string, n = 20) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(take('a')).toEqual(take('a'));
    expect(take('a')).not.toEqual(take('b'));
  });

  it('next() stays in [0,1) with a roughly uniform distribution', () => {
    const r = createRng('dist');
    const buckets = Array<number>(10).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]!++;
    }
    for (const b of buckets) expect(Math.abs(b - N / 10)).toBeLessThan((N / 10) * 0.1);
  });

  it('int() is inclusive and covers the range', () => {
    const r = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('pick() and shuffle() work and shuffle does not mutate', () => {
    const r = createRng('shuf');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const s = r.shuffle(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...s].sort()).toEqual(arr);
    expect(arr).toContain(r.pick(arr));
    expect(() => r.pick([])).toThrow();
  });

  it('shuffle is roughly unbiased for the first position', () => {
    const r = createRng('bias');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[r.shuffle([0, 1, 2, 3])[0]!]!++;
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(200);
  });

  it('weighted() follows weights and ignores zero-weight items', () => {
    const r = createRng('w');
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10000; i++)
      counts[r.weighted(['a', 'b', 'c'] as const, (x) => ({ a: 1, b: 3, c: 0 })[x])]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.6);
    expect(counts.b / counts.a).toBeLessThan(3.4);
  });

  it('fork() is deterministic, independent of consumption and of other labels', () => {
    const a = createRng('seed');
    const before = a.fork('x').next();
    a.next();
    a.next();
    expect(a.fork('x').next()).toBe(before);
    expect(a.fork('y').next()).not.toBe(before);
    expect(createRng('other').fork('x').next()).not.toBe(before);
    expect(a.fork('x').fork('z').next()).toBe(createRng('seed').fork('x').fork('z').next());
  });
});
