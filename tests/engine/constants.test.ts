import { describe, expect, it } from 'vitest';
import { ADJACENCY, GENERATOR_VERSION, GRID_SIZE, PEOPLE } from '../../src/engine/constants';

describe('constants', () => {
  it('defines a 9x9 grid with 9 people', () => {
    expect(GRID_SIZE).toBe(9);
    expect(PEOPLE).toBe(9);
  });

  it('has generator version and adjacency mode', () => {
    expect(GENERATOR_VERSION).toBe(2);
    expect(ADJACENCY).toBe('orthogonal');
  });
});
