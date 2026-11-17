import { describe, expect, it } from 'vitest';
import { computeWalls, firstCellOfRooms } from '../../src/ui/walls';

describe('computeWalls', () => {
  // two rooms: 0 on the left column pair, 1 on the right
  const roomOf = [
    [0, 0, 1],
    [0, 1, 1],
  ];
  const w = computeWalls(roomOf);

  it('marks board edges as walls', () => {
    expect(w[0]![0]).toMatchObject({ top: true, left: true });
    expect(w[1]![2]).toMatchObject({ right: true, bottom: true });
  });

  it('marks room boundaries on both sides and leaves interiors open', () => {
    expect(w[0]![1]!.right).toBe(true);
    expect(w[0]![2]!.left).toBe(true);
    expect(w[0]![0]!.right).toBe(false);
    expect(w[0]![0]!.bottom).toBe(false);
    expect(w[1]![1]!.top).toBe(true);
    expect(w[0]![1]!.bottom).toBe(true);
    expect(w[0]![2]!.bottom).toBe(false);
  });

  it('finds the first cell of each room in row-major order', () => {
    const f = firstCellOfRooms(roomOf);
    expect(f.get(0)).toEqual([0, 0]);
    expect(f.get(1)).toEqual([0, 2]);
  });
});
