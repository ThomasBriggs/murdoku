import { describe, expect, it } from 'vitest';
import { computeWalls, firstCellOfRooms, wallSegments } from '../../src/ui/walls';

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

describe('wallSegments', () => {
  it('merges room boundaries into maximal straight runs, without the board edge', () => {
    const roomOf = [
      [0, 0, 1],
      [0, 1, 1],
      [2, 2, 2],
    ];
    const segs = wallSegments(roomOf);
    expect(segs).toEqual(
      expect.arrayContaining([
        // row 0|1 boundary under column 1 only
        { x1: 1, y1: 1, x2: 2, y2: 1 },
        // the whole row 1|2 boundary is one run
        { x1: 0, y1: 2, x2: 3, y2: 2 },
        // vertical: col 1|2 in row 0, col 0|1 in row 1
        { x1: 2, y1: 0, x2: 2, y2: 1 },
        { x1: 1, y1: 1, x2: 1, y2: 2 },
      ]),
    );
    expect(segs).toHaveLength(4);
  });

  it('returns nothing for a single room', () => {
    expect(
      wallSegments([
        [0, 0],
        [0, 0],
      ]),
    ).toEqual([]);
  });
});

describe('assignRoomColors', () => {
  it('is deterministic and gives adjacent rooms distant hues', async () => {
    const { assignRoomColors } = await import('../../src/ui/roomColors');
    const rooms = [0, 1, 2, 3].map((id) => ({ id })) as never[];
    const roomOf = [
      [0, 1],
      [2, 3],
    ];
    const a = assignRoomColors(rooms, roomOf);
    const b = assignRoomColors(rooms, roomOf);
    expect([...a]).toEqual([...b]);
    expect(new Set([...a.values()].map((c) => c.light)).size).toBe(4);
  });
});
