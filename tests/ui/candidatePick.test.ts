import { describe, expect, it } from 'vitest';
import { cellKey } from '../../src/engine/types';
import { holdCandidates } from '../../src/ui/candidatePick';

const person = (id: number, isVictim = false) =>
  ({ id, isVictim, name: `P${id}`, initial: 'X', color: '#000' }) as never;
// Panel order: victim (id 5) first, then ids ascending => slots: 5->0, 0->1, 1->2, 2->3
const people = [person(0), person(1), person(2), person(5, true)];
const furniture = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)) as never;
const base = {
  puzzle: { people, furniture },
  key: cellKey(2, 3),
  candidatesVisible: true,
  placements: { 0: null, 1: null, 2: null, 5: null },
};

describe('holdCandidates', () => {
  it('maps slots to ids in panel order', () => {
    expect(holdCandidates({ ...base, yes: 0b1011 })).toEqual([5, 0, 2]);
  });
  it('excludes placed people', () => {
    expect(holdCandidates({ ...base, yes: 0b0110, placements: { ...base.placements, 0: 7 } })).toEqual([1]);
  });
  it('is empty when the cell is occupied', () => {
    expect(
      holdCandidates({ ...base, yes: 0b0110, placements: { ...base.placements, 2: base.key } }),
    ).toEqual([]);
  });
  it('is empty on a blocked cell', () => {
    const f = structuredClone(furniture) as unknown as (string | null)[][];
    f[2]![3] = 'table';
    expect(holdCandidates({ ...base, puzzle: { people, furniture: f as never }, yes: 0b10 })).toEqual([]);
  });
  it('is empty when the candidates layer is hidden or nothing is noted', () => {
    expect(holdCandidates({ ...base, yes: 0b10, candidatesVisible: false })).toEqual([]);
    expect(holdCandidates({ ...base, yes: 0 })).toEqual([]);
    expect(holdCandidates({ ...base, yes: undefined })).toEqual([]);
  });
});
