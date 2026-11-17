import { describe, expect, it } from 'vitest';
import { build } from './helpers';

describe('performance', () => {
  it('plan + placement + decoration averages < 20 ms over 200 seeds', () => {
    build('warmup');
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) build(`timing-${i}`);
    const avg = (performance.now() - t0) / 200;
    console.log(`engine core average: ${avg.toFixed(2)} ms`);
    expect(avg).toBeLessThan(20);
  });
});
