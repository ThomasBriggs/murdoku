import { describe, expect, it } from 'vitest';
import { defaultFab, FAB_SIZE } from '../../src/ui/scratchLayout';

describe('defaultFab placement on phones', () => {
  it('sits just above a measured phone dock', () => {
    const f = defaultFab({ w: 375, h: 667 }, 559);
    expect(f).toEqual({ x: 10, y: 559 - 10 - FAB_SIZE });
  });
  it('moves clear of the left-hand dock on landscape phones', () => {
    const f = defaultFab({ w: 844, h: 390 });
    expect(f.x).toBeGreaterThan(90);
    expect(f.y).toBe(390 - FAB_SIZE - 8);
  });
});
