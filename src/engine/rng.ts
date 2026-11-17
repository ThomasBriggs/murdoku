/** Seeded, fully deterministic PRNG: string seed -> xmur3 hash -> sfc32. */

export interface Rng {
  /** The seed string this stream was created from (forks extend it). */
  readonly seed: string;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, maxInclusive]. */
  int(min: number, maxInclusive: number): number;
  /** Uniformly pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates; returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Pick one element with probability proportional to weightFn(item). */
  weighted<T>(items: readonly T[], weightFn: (item: T) => number): T;
  /**
   * Derive an independent sub-stream. The result depends only on this stream's
   * seed and the label, not on how much of this stream has been consumed.
   */
  fork(label: string): Rng;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const h = xmur3(seed);
  const gen = sfc32(h(), h(), h(), h());
  for (let i = 0; i < 15; i++) gen(); // warm up

  const rng: Rng = {
    seed,
    next: gen,
    int(min, maxInclusive) {
      return min + Math.floor(gen() * (maxInclusive - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[Math.floor(gen() * items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(gen() * (i + 1));
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[j] as (typeof out)[number];
        out[j] = tmp;
      }
      return out;
    },
    weighted(items, weightFn) {
      if (items.length === 0) throw new Error('rng.weighted: empty array');
      const weights = items.map((it) => Math.max(0, weightFn(it)));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return rng.pick(items);
      let x = gen() * total;
      for (let i = 0; i < items.length; i++) {
        x -= weights[i] as number;
        if (x < 0) return items[i] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    fork(label) {
      return createRng(`${seed}\u0000${label}`);
    },
  };
  return rng;
}
