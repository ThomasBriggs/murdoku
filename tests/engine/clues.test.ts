import { describe, expect, it } from 'vitest';
import { checkPlacement, personCandidates } from '../../src/engine/clues/evaluate';
import { allStaticAtoms } from '../../src/engine/clues/facts';
import { getBoard } from '../../src/engine/clues/board';
import { renderClue } from '../../src/engine/clues/render';
import { setHas, setCount } from '../../src/engine/cellset';
import { neighbours } from '../../src/engine/types';
import type { Cell, Person, Room } from '../../src/engine/types';
import { randomCluePuzzle } from './helpers';

const seeds = Array.from({ length: 150 }, (_, i) => `clue-${i}`);

describe('facts', () => {
  it('every derived fact is true for the solution (independent check)', () => {
    for (const seed of seeds) {
      const { puzzle, facts, solution, plan, furniture } = randomCluePuzzle(seed);
      const roomAt = (c: Cell) => plan.roomOf[c.r]![c.c]!;
      facts.forEach((atoms, p) => {
        const cell = solution.cellOf[p]!;
        expect(atoms.length).toBeGreaterThan(0);
        for (const a of atoms) {
          switch (a.kind) {
            case 'inRoom':
              expect(roomAt(cell)).toBe(a.room);
              break;
            case 'notInRoom':
              expect(roomAt(cell)).not.toBe(a.room);
              break;
            case 'on':
              expect(furniture[cell.r]![cell.c]).toBe(a.furniture);
              break;
            case 'beside':
              expect(
                neighbours(cell.r, cell.c).some((n) => furniture[n.r]![n.c] === a.furniture),
              ).toBe(true);
              break;
            case 'notBeside':
              expect(
                neighbours(cell.r, cell.c).some((n) => furniture[n.r]![n.c] === a.furniture),
              ).toBe(false);
              break;
            case 'row':
              expect(cell.r).toBe(a.index);
              break;
            case 'col':
              expect(cell.c).toBe(a.index);
              break;
            case 'alone':
              expect(solution.cellOf.filter((o) => roomAt(o) === roomAt(cell))).toHaveLength(1);
              break;
            case 'sameRoomAs':
              expect(roomAt(solution.cellOf[a.person]!)).toBe(roomAt(cell));
              break;
            case 'roomCorner':
            case 'roomEdge':
              break;
          }
        }
      });
      expect(puzzle.clues).toHaveLength(9);
    }
  });

  it('corner and edge follow the wall definition', () => {
    for (const seed of seeds.slice(0, 30)) {
      const { plan, furniture } = randomCluePuzzle(seed);
      const board = getBoard({ roomOf: plan.roomOf, rooms: plan.rooms, furniture });
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          const wall = (dr: number, dc: number) => {
            const rr = r + dr;
            const cc = c + dc;
            return (
              rr < 0 || rr > 8 || cc < 0 || cc > 8 || plan.roomOf[rr]![cc] !== plan.roomOf[r]![c]
            );
          };
          const corner = (wall(-1, 0) || wall(1, 0)) && (wall(0, -1) || wall(0, 1));
          const any = wall(-1, 0) || wall(1, 0) || wall(0, -1) || wall(0, 1);
          expect((board.corner[r]! >> c) & 1).toBe(corner ? 1 : 0);
          expect((board.edge[r]! >> c) & 1).toBe(any && !corner ? 1 : 0);
        }
    }
  });
});

describe('evaluate', () => {
  it("solution cell is always in each person's candidate set", () => {
    for (const seed of seeds) {
      const { puzzle, solution } = randomCluePuzzle(seed, 3);
      const cands = personCandidates(puzzle);
      cands.forEach((set, p) => {
        const cell = solution.cellOf[p]!;
        expect(setHas(set, cell.r, cell.c)).toBe(true);
      });
    }
  });

  it('static atoms actually cut candidates', () => {
    const { puzzle } = randomCluePuzzle('cuts');
    const board = getBoard(puzzle);
    expect(allStaticAtoms(board).length).toBeGreaterThan(20);
    expect(personCandidates(puzzle).some((s) => setCount(s) < setCount(board.free))).toBe(true);
  });
});

describe('checkPlacement', () => {
  it('accepts the solution and every partial prefix of it', () => {
    for (const seed of seeds) {
      const { puzzle, solution } = randomCluePuzzle(seed);
      expect(checkPlacement(puzzle, solution.cellOf)).toEqual([]);
      const partial = solution.cellOf.map((c, i) => (i % 2 === 0 ? c : null));
      expect(checkPlacement(puzzle, partial)).toEqual([]);
      expect(
        checkPlacement(
          puzzle,
          solution.cellOf.map(() => null),
        ),
      ).toEqual([]);
    }
  });

  it('detects row and column duplicates', () => {
    const { puzzle, solution } = randomCluePuzzle('dup');
    const p = solution.cellOf.map((c) => ({ ...c }));
    p[1] = { r: p[0]!.r, c: (p[0]!.c + 1) % 9 };
    const kinds = checkPlacement(puzzle, p).map((v) => v.kind);
    expect(kinds).toContain('row');
    const q = solution.cellOf.map((c) => ({ ...c }));
    q[1] = { r: (q[0]!.r + 1) % 9, c: q[0]!.c };
    expect(checkPlacement(puzzle, q).map((v) => v.kind)).toContain('column');
  });

  it('detects blocking cells', () => {
    const { puzzle, furniture } = randomCluePuzzle('blocked');
    const board = getBoard(puzzle);
    let blocked: Cell | null = null;
    for (let r = 0; r < 9 && !blocked; r++)
      for (let c = 0; c < 9; c++) if (!setHas(board.free, r, c)) blocked = { r, c };
    expect(blocked).not.toBeNull();
    expect(furniture[blocked!.r]![blocked!.c]).not.toBeNull();
    const placement = puzzle.people.map((_, i) => (i === 3 ? blocked : null));
    const v = checkPlacement(puzzle, placement);
    expect(v.map((x) => x.kind)).toContain('blocked');
    expect(v.find((x) => x.kind === 'blocked')!.persons).toEqual([3]);
  });

  it('detects violated clues but not for unplaced people', () => {
    const { puzzle, solution } = randomCluePuzzle('clue', 3);
    const cands = personCandidates(puzzle);
    const board = getBoard(puzzle);
    // find a person and a free cell outside their candidate set
    let found = false;
    for (const p of puzzle.people) {
      for (let r = 0; r < 9 && !found; r++)
        for (let c = 0; c < 9 && !found; c++) {
          if (!setHas(board.free, r, c) || setHas(cands[p.id]!, r, c)) continue;
          const placement = puzzle.people.map((_, i) => (i === p.id ? { r, c } : null));
          const v = checkPlacement(puzzle, placement).filter((x) => x.kind === 'clue');
          expect(v.length).toBeGreaterThan(0);
          expect(v[0]!.persons).toContain(p.id);
          found = true;
        }
      if (found) break;
    }
    expect(found).toBe(true);
    expect(
      checkPlacement(
        puzzle,
        solution.cellOf.map(() => null),
      ),
    ).toEqual([]);
  });

  it('detects relational violations and the murder rule', () => {
    const { puzzle, solution, plan } = randomCluePuzzle('murder');
    const victim = puzzle.people.find((p) => p.isVictim)!;
    const vRoom =
      plan.rooms[plan.roomOf[solution.cellOf[victim.id]!.r]![solution.cellOf[victim.id]!.c]!]!;
    // move every suspect into the victim's room cells where free of rows/cols clash is irrelevant: check murder only
    const inRoom = puzzle.people.filter(
      (p) =>
        !p.isVictim &&
        vRoom.cells.some(
          (c) => c.r === solution.cellOf[p.id]!.r && c.c === solution.cellOf[p.id]!.c,
        ),
    );
    expect(inRoom).toHaveLength(1);
    // victim placed, suspects placed, but murderer removed from the room by placing at another cell
    const other = solution.cellOf.find(
      (c) => !vRoom.cells.some((x) => x.r === c.r && x.c === c.c),
    )!;
    const bad = solution.cellOf.map((c) => ({ ...c }));
    bad[inRoom[0]!.id] = { ...other }; // duplicate cell, still reports murder (no suspect in room)
    expect(checkPlacement(puzzle, bad).map((v) => v.kind)).toContain('murder');
    // alone / sameRoomAs
    const withAlone = { ...puzzle, clues: puzzle.clues.map((c) => ({ ...c })) };
    withAlone.clues[0] = { person: 0, atoms: [{ kind: 'alone' }] };
    withAlone.clues[1] = { person: 1, atoms: [{ kind: 'sameRoomAs', person: 2 }] };
    const sol = solution.cellOf;
    const roomOf = (p: number) => plan.roomOf[sol[p]!.r]![sol[p]!.c]!;
    const mate = puzzle.people.find((p) => p.id !== 0 && roomOf(p.id) === roomOf(0));
    if (mate) {
      expect(
        checkPlacement(
          withAlone,
          sol.map((c, i) => (i === 0 || i === mate.id ? c : null)),
        ).map((v) => v.kind),
      ).toContain('clue');
    }
    if (roomOf(1) !== roomOf(2)) {
      expect(
        checkPlacement(
          withAlone,
          sol.map((c, i) => (i === 1 || i === 2 ? c : null)),
        ).map((v) => v.kind),
      ).toContain('clue');
    }
  });
});

describe('render', () => {
  const rooms = [
    { id: 0, type: 'study', name: 'Study', cells: [], color: '' },
    { id: 1, type: 'library', name: 'Library', cells: [], color: '' },
  ] as Room[];
  const people = ['Charles', 'Beatrice', 'Alice'].map((name, id) => ({
    id,
    name,
    initial: name[0],
    color: '#000',
    isVictim: false,
  })) as Person[];
  const ctx = { rooms, people };
  const text = (atoms: Parameters<typeof renderClue>[1]['atoms']) =>
    renderClue(ctx, { person: 0, atoms }).text;

  it('renders the spec example', () => {
    expect(
      text([
        { kind: 'beside', furniture: 'bookshelf' },
        { kind: 'on', furniture: 'chair' },
        { kind: 'inRoom', room: 0 },
      ]),
    ).toBe('Charles was sitting on a chair in the Study, beside a bookshelf.');
  });

  it('renders each atom kind', () => {
    expect(text([{ kind: 'on', furniture: 'bed' }])).toBe('Charles was lying on a bed.');
    expect(text([{ kind: 'on', furniture: 'armchair' }])).toBe(
      'Charles was sitting on an armchair.',
    );
    expect(text([{ kind: 'on', furniture: 'rug' }])).toBe('Charles was standing on a rug.');
    expect(text([{ kind: 'notInRoom', room: 1 }])).toBe('Charles was not in the Library.');
    expect(text([{ kind: 'notBeside', furniture: 'table' }])).toBe(
      'Charles was not beside any table.',
    );
    expect(text([{ kind: 'row', index: 2 }])).toBe('Charles was in row 3.');
    expect(text([{ kind: 'col', index: 3 }])).toBe('Charles was in column D.');
    expect(text([{ kind: 'alone' }])).toBe('Charles was alone in the room.');
    expect(text([{ kind: 'sameRoomAs', person: 1 }])).toBe(
      'Charles was in the same room as Beatrice.',
    );
    expect(text([{ kind: 'roomCorner' }])).toBe('Charles was in a corner of the room.');
    expect(text([{ kind: 'roomEdge' }])).toBe('Charles was against a wall of the room.');
    expect(
      text([
        { kind: 'beside', furniture: 'plant' },
        { kind: 'beside', furniture: 'tv' },
      ]),
    ).toBe('Charles was beside a plant and beside a television.');
  });

  it('combines three atoms with commas and "and"', () => {
    expect(text([{ kind: 'inRoom', room: 1 }, { kind: 'alone' }, { kind: 'col', index: 0 }])).toBe(
      'Charles was in the Library, in column A and with no one else in the room.',
    );
    expect(text([{ kind: 'inRoom', room: 0 }, { kind: 'alone' }])).toBe(
      'Charles was in the Study, with no one else in the room.',
    );
  });

  it('emits token spans for rooms, furniture and people', () => {
    const r = renderClue(ctx, {
      person: 1,
      atoms: [
        { kind: 'on', furniture: 'chair' },
        { kind: 'inRoom', room: 0 },
        { kind: 'sameRoomAs', person: 2 },
      ],
    });
    expect(r.tokens.map((t) => t.text).join('')).toBe(r.text);
    expect(r.tokens.filter((t) => t.kind !== 'plain')).toEqual([
      { text: 'Beatrice', kind: 'person', ref: 1 },
      { text: 'chair', kind: 'furniture', ref: 'chair' },
      { text: 'Study', kind: 'room', ref: 0 },
      { text: 'Alice', kind: 'person', ref: 2 },
    ]);
  });
});
