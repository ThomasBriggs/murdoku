import { describe, expect, it } from 'vitest';
import { cellKey, inBounds, neighbours, parseCellKey } from '../../src/engine/types';
import { FURNITURE, FURNITURE_TYPES, isOccupiable } from '../../src/engine/furniture';
import { ROOM_TYPES, ROOM_TYPE_IDS } from '../../src/engine/rooms';
import { canPlaceIn } from '../../src/engine/furniture';

describe('grid helpers', () => {
  it('cell keys round-trip', () => {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        expect(parseCellKey(cellKey({ r, c }))).toEqual({ r, c });
        expect(cellKey(r, c)).toBe(cellKey({ r, c }));
      }
    expect(new Set(Array.from({ length: 81 }, (_, i) => cellKey(parseCellKey(i)))).size).toBe(81);
  });

  it('inBounds and neighbours (orthogonal)', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(9, 0)).toBe(false);
    expect(inBounds(-1, 3)).toBe(false);
    expect(neighbours(0, 0)).toHaveLength(2);
    expect(neighbours(0, 4)).toHaveLength(3);
    expect(neighbours(4, 4)).toHaveLength(4);
    for (const n of neighbours(4, 4)) expect(Math.abs(n.r - 4) + Math.abs(n.c - 4)).toBe(1);
  });
});

describe('furniture catalogue', () => {
  it('has the 14 types with the right occupiable flags and verbs', () => {
    expect(FURNITURE_TYPES).toHaveLength(14);
    const occ = FURNITURE_TYPES.filter(isOccupiable).sort();
    expect(occ).toEqual(['armchair', 'bed', 'chair', 'rug', 'sofa']);
    expect(FURNITURE.chair.verb).toBe('sitting on');
    expect(FURNITURE.armchair.verb).toBe('sitting on');
    expect(FURNITURE.sofa.verb).toBe('sitting on');
    expect(FURNITURE.bed.verb).toBe('lying on');
    expect(FURNITURE.rug.verb).toBe('standing on');
    expect(FURNITURE.table.verb).toBeNull();
  });

  it('room palettes only use furniture the catalogue allows there, with the right kind', () => {
    expect(ROOM_TYPE_IDS).toHaveLength(10);
    for (const id of ROOM_TYPE_IDS) {
      const { palette } = ROOM_TYPES[id];
      for (const t of palette.blocking) {
        expect(isOccupiable(t)).toBe(false);
        expect(canPlaceIn(t, id)).toBe(true);
      }
      for (const t of palette.occupiable) {
        expect(isOccupiable(t)).toBe(true);
        expect(canPlaceIn(t, id)).toBe(true);
      }
    }
  });

  it('room colours are distinct', () => {
    expect(new Set(ROOM_TYPE_IDS.map((i) => ROOM_TYPES[i].color.light)).size).toBe(10);
  });
});
