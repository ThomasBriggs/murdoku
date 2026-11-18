import { GRID_SIZE, PEOPLE } from '../constants';
import { cellLabel, lowBit, popcount, ROW_FULL, setCells, type CellSet } from '../cellset';
import { renderClue } from '../clues/render';
import type { Cell, PersonId, Puzzle } from '../types';
import { buildModel, type Model } from './model';

/**
 * Human-style techniques, easiest first (SPEC §5.5):
 * 1 clue filtering, 2 single candidate, 3 row/column singles (hidden and naked),
 * 4 room logic (alone / same room / victim + exactly one suspect),
 * 5 locked sets (k people confined to k rows/columns, k <= 4),
 * 6 depth-1 trial elimination (propagating techniques 2-4).
 */
export type Technique = 1 | 2 | 3 | 4 | 5 | 6;

export interface Deduction {
  technique: Technique;
  kind: 'place' | 'eliminate';
  /** Set when the deduction concerns a single person. */
  person?: PersonId;
  /** 'place': the cell chosen. 'eliminate': every cell removed (for any person). */
  cells: Cell[];
  /** 'eliminate' only: the removed cells per person. */
  eliminations?: { person: PersonId; cells: Cell[] }[];
  /** Plain-English reasoning. Empty when the solver ran with explain: false. */
  explanation: string;
  /** Cells the reasoning is about (for highlighting). */
  involvedCells: Cell[];
}

export interface SolveResult {
  solved: boolean;
  steps: Deduction[];
  maxTechniqueUsed: Technique;
  /** Remaining candidates per person when the solver stopped. */
  candidates: CellSet[];
}

export interface SolveOptions {
  /** Build explanations and record steps (default true). The generator turns it off for speed. */
  explain?: boolean;
}

/** The player's current board, for hints. */
export interface PlayerState {
  placements: readonly (Cell | null | undefined)[];
}

const N = GRID_SIZE;

interface Recorder {
  explain: boolean;
  steps: Deduction[];
  maxTech: number;
}

interface Ctx {
  m: Model;
  rec: Recorder | null;
  nRooms: number;
}

type Cand = Uint16Array;
type Removal = (Uint16Array | undefined)[];
interface Change {
  person: PersonId;
  set: Uint16Array;
}

// ---------------------------------------------------------------- primitives

function addRemoval(rem: Removal, p: number, r: number, bits: number): void {
  if (!bits) return;
  const set = (rem[p] ??= new Uint16Array(N));
  set[r] = set[r]! | bits;
}

/** Apply a removal; returns what actually changed. */
function commit(cand: Cand, rem: Removal): Change[] {
  const out: Change[] = [];
  for (let p = 0; p < PEOPLE; p++) {
    const set = rem[p];
    if (!set) continue;
    let changed: Uint16Array | null = null;
    for (let r = 0; r < N; r++) {
      const gone = cand[p * N + r]! & set[r]!;
      if (gone) {
        (changed ??= new Uint16Array(N))[r] = gone;
        cand[p * N + r] = cand[p * N + r]! & ~gone;
      }
    }
    if (changed) out.push({ person: p, set: changed });
  }
  return out;
}

function placeAt(cand: Cand, p: number, r: number, c: number): void {
  const bit = 1 << c;
  for (let rr = 0; rr < N; rr++) cand[p * N + rr] = rr === r ? bit : 0;
  for (let q = 0; q < PEOPLE; q++) {
    if (q === p) continue;
    for (let rr = 0; rr < N; rr++) cand[q * N + rr] = cand[q * N + rr]! & ~bit;
    cand[q * N + r] = 0;
  }
}

function rowMaskOf(cand: Cand, p: number): number {
  let m = 0;
  for (let r = 0; r < N; r++) if (cand[p * N + r]) m |= 1 << r;
  return m;
}

function colMaskOf(cand: Cand, p: number): number {
  let m = 0;
  for (let r = 0; r < N; r++) m |= cand[p * N + r]!;
  return m;
}

function countOf(cand: Cand, p: number): number {
  let n = 0;
  for (let r = 0; r < N; r++) n += popcount(cand[p * N + r]!);
  return n;
}

function candSet(cand: Cand, p: number): CellSet {
  return cand.slice(p * N, p * N + N) as CellSet;
}

function hasContradiction(cand: Cand): boolean {
  let colsCovered = 0;
  const rowCovered = new Uint8Array(N);
  for (let p = 0; p < PEOPLE; p++) {
    let any = false;
    for (let r = 0; r < N; r++) {
      const m = cand[p * N + r]!;
      if (m) {
        any = true;
        rowCovered[r] = 1;
        colsCovered |= m;
      }
    }
    if (!any) return true;
  }
  if (colsCovered !== ROW_FULL) return true;
  for (let r = 0; r < N; r++) if (!rowCovered[r]) return true;
  return false;
}

function roomsOfPeople(ctx: Ctx, cand: Cand): number[] {
  const sets = ctx.m.board.roomSets;
  const out: number[] = new Array<number>(PEOPLE).fill(0);
  for (let p = 0; p < PEOPLE; p++) {
    for (let room = 0; room < ctx.nRooms; room++) {
      const rs = sets[room]!;
      for (let r = 0; r < N; r++) {
        if (cand[p * N + r]! & rs[r]!) {
          out[p] = out[p]! | (1 << room);
          break;
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------- output

const rowName = (r: number) => `row ${r + 1}`;
const colName = (c: number) => `column ${'ABCDEFGHI'.charAt(c)}`;

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function maskIndices(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

function changeCells(c: Change): Cell[] {
  return setCells(c.set as CellSet);
}

function name(ctx: Ctx, p: PersonId): string {
  return ctx.m.puzzle.people[p]?.name ?? `Person ${p}`;
}

function roomName(ctx: Ctx, room: number): string {
  return ctx.m.puzzle.rooms[room]?.name ?? `room ${room}`;
}

function record(
  ctx: Ctx,
  technique: Technique,
  kind: Deduction['kind'],
  cells: () => Cell[],
  involved: () => Cell[],
  text: () => string,
  extra: { person?: PersonId; changes?: Change[] } = {},
): void {
  const rec = ctx.rec;
  if (!rec) return;
  if (technique > rec.maxTech) rec.maxTech = technique;
  if (!rec.explain) return;
  const d: Deduction = {
    technique,
    kind,
    cells: cells(),
    explanation: text(),
    involvedCells: involved(),
  };
  if (extra.person !== undefined) d.person = extra.person;
  if (extra.changes) {
    d.eliminations = extra.changes.map((c) => ({ person: c.person, cells: changeCells(c) }));
    if (extra.person === undefined && extra.changes.length === 1)
      d.person = extra.changes[0]!.person;
  }
  rec.steps.push(d);
}

/** Commit a removal and record it as one elimination. Returns true if anything changed. */
function applyRemoval(
  ctx: Ctx,
  cand: Cand,
  tech: Technique,
  rem: Removal,
  involved: () => Cell[],
  text: () => string,
): boolean {
  const changes = commit(cand, rem);
  if (changes.length === 0) return false;
  record(ctx, tech, 'eliminate', () => changes.flatMap(changeCells), involved, text, { changes });
  return true;
}

function roomCells(ctx: Ctx, room: number): Cell[] {
  return setCells(ctx.m.board.roomSets[room]!);
}

// -------------------------------------------------------- technique 1: clues

function clueFiltering(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  const free = ctx.m.board.free;
  for (let p = 0; p < PEOPLE; p++) {
    const rem: Removal = [];
    for (let r = 0; r < N; r++) {
      const gone = free[r]! & ~ctx.m.cand0[p * N + r]!;
      addRemoval(rem, p, r, gone & cand[p * N + r]!);
    }
    // Blocked cells are never allowed, whatever the clue says.
    for (let r = 0; r < N; r++) addRemoval(rem, p, r, cand[p * N + r]! & ~free[r]!);
    const clue = ctx.m.puzzle.clues.find((c) => c.person === p);
    const done = applyRemoval(
      ctx,
      cand,
      1,
      rem,
      () => setCells(candSet(cand, p)),
      () => {
        const sentence = clue ? renderClue(ctx.m.puzzle, clue).text : `${name(ctx, p)}'s clue`;
        return `${sentence} That leaves ${countOf(cand, p)} possible cells for ${name(ctx, p)}.`;
      },
    );
    any = any || done;
  }
  return any;
}

// ------------------------------------------------ technique 2: single candidate

function singleCandidate(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  for (let p = 0; p < PEOPLE; p++) {
    if (countOf(cand, p) !== 1) continue;
    const r = lowBit(rowMaskOf(cand, p));
    const c = lowBit(cand[p * N + r]!);
    let needed = false;
    for (let q = 0; q < PEOPLE && !needed; q++) {
      if (q === p) continue;
      if (cand[q * N + r]) needed = true;
      else for (let rr = 0; rr < N; rr++) if (cand[q * N + rr]! & (1 << c)) needed = true;
    }
    if (!needed) continue;
    const staticOnly = countStatic(ctx, p) === 1;
    placeAt(cand, p, r, c);
    any = true;
    record(
      ctx,
      2,
      'place',
      () => [{ r, c }],
      () => [{ r, c }],
      () =>
        staticOnly
          ? `${clueSentence(ctx, p)} Only one free cell fits that, so ${name(ctx, p)} must be at ${cellLabel({ r, c })}.`
          : `Everywhere else is ruled out for ${name(ctx, p)}, so ${name(ctx, p)} must be at ${cellLabel({ r, c })}.`,
      { person: p },
    );
  }
  return any;
}

function clueSentence(ctx: Ctx, p: PersonId): string {
  const clue = ctx.m.puzzle.clues.find((c) => c.person === p);
  return clue ? renderClue(ctx.m.puzzle, clue).text : `${name(ctx, p)}'s clue`;
}

function countStatic(ctx: Ctx, p: number): number {
  let n = 0;
  for (let r = 0; r < N; r++) n += popcount(ctx.m.cand0[p * N + r]!);
  return n;
}

// ------------------------------------------- technique 3: row/column singles

function singles(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  for (;;) {
    if (!singlesOnce(ctx, cand)) return any;
    any = true;
  }
}

function singlesOnce(ctx: Ctx, cand: Cand): boolean {
  const personRows = new Array<number>(PEOPLE);
  const personCols = new Array<number>(PEOPLE);
  const rowPersons = new Array<number>(N).fill(0);
  const colPersons = new Array<number>(N).fill(0);
  for (let p = 0; p < PEOPLE; p++) {
    personRows[p] = rowMaskOf(cand, p);
    personCols[p] = colMaskOf(cand, p);
    for (let r = 0; r < N; r++)
      if (personRows[p]! & (1 << r)) rowPersons[r] = rowPersons[r]! | (1 << p);
    for (let c = 0; c < N; c++)
      if (personCols[p]! & (1 << c)) colPersons[c] = colPersons[c]! | (1 << p);
  }
  // Hidden singles: a row/column with exactly one person able to fill it.
  for (const byRow of [true, false]) {
    const lines = byRow ? rowPersons : colPersons;
    for (let i = 0; i < N; i++) {
      if (popcount(lines[i]!) !== 1) continue;
      const p = lowBit(lines[i]!);
      const rem: Removal = [];
      for (let r = 0; r < N; r++) {
        if (byRow) addRemoval(rem, p, r, r === i ? 0 : cand[p * N + r]!);
        else addRemoval(rem, p, r, cand[p * N + r]! & ~(1 << i));
      }
      const lineName = byRow ? rowName(i) : colName(i);
      // Would the person end up with one cell? Then it is a placement.
      let remaining = 0;
      let cell: Cell | null = null;
      for (let r = 0; r < N; r++) {
        const keep = byRow ? (r === i ? cand[p * N + r]! : 0) : cand[p * N + r]! & (1 << i);
        remaining += popcount(keep);
        if (keep) cell = { r, c: lowBit(keep) };
      }
      if (remaining === 1 && cell) {
        if (countOf(cand, p) === 1) {
          // already narrowed to one cell: technique 2 propagates it
          continue;
        }
        const target = cell;
        placeAt(cand, p, target.r, target.c);
        record(
          ctx,
          3,
          'place',
          () => [target],
          () => [target],
          () =>
            `${name(ctx, p)} is the only person who can still be in ${lineName}, and only ${cellLabel(target)} is left there, so ${name(ctx, p)} must be at ${cellLabel(target)}.`,
          { person: p },
        );
        return true;
      }
      const involved = () =>
        setCells(candSet(cand, p)).concat(
          setCells(ctx.m.board.free).filter((x) => (byRow ? x.r === i : x.c === i)),
        );
      if (
        applyRemoval(
          ctx,
          cand,
          3,
          rem,
          involved,
          () =>
            `${name(ctx, p)} is the only person who can still be in ${lineName}, so ${name(ctx, p)} must be in ${lineName} and nowhere else.`,
        )
      )
        return true;
    }
  }
  // Naked singles: a person confined to one row/column rules it out for everyone else.
  for (const byRow of [true, false]) {
    const masks = byRow ? personRows : personCols;
    for (let p = 0; p < PEOPLE; p++) {
      if (popcount(masks[p]!) !== 1) continue;
      const i = lowBit(masks[p]!);
      const rem: Removal = [];
      for (let q = 0; q < PEOPLE; q++) {
        if (q === p) continue;
        for (let r = 0; r < N; r++) {
          if (byRow) addRemoval(rem, q, r, r === i ? cand[q * N + r]! : 0);
          else addRemoval(rem, q, r, cand[q * N + r]! & (1 << i));
        }
      }
      const lineName = byRow ? rowName(i) : colName(i);
      if (
        applyRemoval(
          ctx,
          cand,
          3,
          rem,
          () => setCells(candSet(cand, p)),
          () => `${name(ctx, p)} can only be in ${lineName}, so nobody else can be in ${lineName}.`,
        )
      )
        return true;
    }
  }
  return false;
}

// ------------------------------------------------------ technique 4: room logic

function roomLogic(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  while (roomLogicOnce(ctx, cand)) any = true;
  return any;
}

function removeFromRoom(ctx: Ctx, rem: Removal, persons: number[], room: number, cand: Cand): void {
  const rs = ctx.m.board.roomSets[room]!;
  for (const p of persons)
    for (let r = 0; r < N; r++) addRemoval(rem, p, r, cand[p * N + r]! & rs[r]!);
}

function removeOutsideRoom(ctx: Ctx, rem: Removal, p: number, room: number, cand: Cand): void {
  const rs = ctx.m.board.roomSets[room]!;
  for (let r = 0; r < N; r++) addRemoval(rem, p, r, cand[p * N + r]! & ~rs[r]!);
}

function roomLogicOnce(ctx: Ctx, cand: Cand): boolean {
  const { m } = ctx;
  const roomsOf = roomsOfPeople(ctx, cand);
  const confinedTo = (p: number): number =>
    popcount(roomsOf[p]!) === 1 ? lowBit(roomsOf[p]!) : -1;
  const allBut = (...ps: number[]) =>
    Array.from({ length: PEOPLE }, (_, i) => i).filter((i) => !ps.includes(i));
  const inv = (rooms: number[], ps: number[]) => () =>
    rooms.flatMap((rm) => roomCells(ctx, rm)).concat(ps.flatMap((p) => setCells(candSet(cand, p))));

  // Alone: nobody else may share the room.
  for (let p = 0; p < PEOPLE; p++) {
    if (!m.alone[p]) continue;
    for (let q = 0; q < PEOPLE; q++) {
      const room = q === p ? -1 : confinedTo(q);
      if (room < 0 || !(roomsOf[p]! & (1 << room))) continue;
      const rem: Removal = [];
      removeFromRoom(ctx, rem, [p], room, cand);
      if (
        applyRemoval(
          ctx,
          cand,
          4,
          rem,
          inv([room], [q]),
          () =>
            `${name(ctx, p)} was alone in the room, but ${name(ctx, q)} must be in the ${roomName(ctx, room)}, so ${name(ctx, p)} cannot be there.`,
        )
      )
        return true;
    }
    const own = confinedTo(p);
    if (own >= 0) {
      const rem: Removal = [];
      removeFromRoom(ctx, rem, allBut(p), own, cand);
      if (
        applyRemoval(
          ctx,
          cand,
          4,
          rem,
          inv([own], [p]),
          () =>
            `${name(ctx, p)} was alone in the room and must be in the ${roomName(ctx, own)}, so nobody else can be in the ${roomName(ctx, own)}.`,
        )
      )
        return true;
    }
  }

  // Same room: both people must be able to reach a common room.
  for (const [a, b] of m.sameAs) {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      const bad = roomsOf[p]! & ~roomsOf[q]!;
      for (const room of maskIndices(bad)) {
        const rem: Removal = [];
        removeFromRoom(ctx, rem, [p], room, cand);
        if (
          applyRemoval(
            ctx,
            cand,
            4,
            rem,
            inv([room], [q]),
            () =>
              `${name(ctx, p)} was in the same room as ${name(ctx, q)}, who cannot be in the ${roomName(ctx, room)}, so ${name(ctx, p)} is not there either.`,
          )
        )
          return true;
      }
    }
  }

  // Murder: the victim's room holds exactly one suspect.
  const v = m.victim;
  if (v >= 0) {
    const suspects = allBut(v);
    const can = (room: number) => suspects.filter((s) => roomsOf[s]! & (1 << room));
    const conf = (room: number) => suspects.filter((s) => confinedTo(s) === room);
    for (const room of maskIndices(roomsOf[v]!)) {
      const canList = can(room);
      const confList = conf(room);
      const reason =
        canList.length === 0
          ? `No suspect can be in the ${roomName(ctx, room)}, but the victim's room must hold exactly one suspect`
          : confList.length >= 2
            ? `${listOf(confList.map((s) => name(ctx, s)))} must all be in the ${roomName(ctx, room)}, but the victim's room holds exactly one suspect`
            : null;
      if (reason) {
        const rem: Removal = [];
        removeFromRoom(ctx, rem, [v], room, cand);
        if (
          applyRemoval(
            ctx,
            cand,
            4,
            rem,
            inv([room], confList),
            () => `${reason}, so ${name(ctx, v)} cannot be there.`,
          )
        )
          return true;
      }
    }
    const vr = confinedTo(v);
    if (vr >= 0) {
      const canList = can(vr);
      const confList = conf(vr);
      if (confList.length === 1) {
        const rem: Removal = [];
        removeFromRoom(
          ctx,
          rem,
          suspects.filter((s) => s !== confList[0]),
          vr,
          cand,
        );
        if (
          applyRemoval(
            ctx,
            cand,
            4,
            rem,
            inv([vr], [v, confList[0]!]),
            () =>
              `${name(ctx, v)} is in the ${roomName(ctx, vr)} and ${name(ctx, confList[0]!)} must be there too; exactly one suspect shares the victim's room, so no other suspect can be in the ${roomName(ctx, vr)}.`,
          )
        )
          return true;
      } else if (confList.length === 0 && canList.length === 1) {
        const s = canList[0]!;
        const rem: Removal = [];
        removeOutsideRoom(ctx, rem, s, vr, cand);
        if (
          applyRemoval(
            ctx,
            cand,
            4,
            rem,
            inv([vr], [v, s]),
            () =>
              `${name(ctx, v)} is in the ${roomName(ctx, vr)} and a suspect must be there too. Only ${name(ctx, s)} can be, so ${name(ctx, s)} must be in the ${roomName(ctx, vr)}.`,
          )
        )
          return true;
      }
    }
  }
  return false;
}

// ------------------------------------------------------ technique 5: locked sets

/** Enumerate item subsets of exactly size k whose combined masks have exactly k bits. */
function enumLocked(
  masks: number[],
  k: number,
  cb: (set: number, union: number) => boolean,
): boolean {
  const pool: number[] = [];
  for (let i = 0; i < masks.length; i++) {
    const pc = popcount(masks[i]!);
    if (pc > 0 && pc <= k) pool.push(i);
  }
  const rec = (start: number, set: number, union: number, size: number): boolean => {
    if (size === k) return popcount(union) === k && cb(set, union);
    for (let j = start; j < pool.length; j++) {
      const i = pool[j]!;
      const nu = union | masks[i]!;
      if (popcount(nu) > k) continue;
      if (rec(j + 1, set | (1 << i), nu, size + 1)) return true;
    }
    return false;
  };
  return rec(0, 0, 0, 0);
}

function lockedSets(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  while (lockedOnce(ctx, cand)) any = true;
  return any;
}

function lockedOnce(ctx: Ctx, cand: Cand): boolean {
  const personRows: number[] = [];
  const personCols: number[] = [];
  const rowPersons: number[] = new Array<number>(N).fill(0);
  const colPersons: number[] = new Array<number>(N).fill(0);
  for (let p = 0; p < PEOPLE; p++) {
    const rm = rowMaskOf(cand, p);
    const cm = colMaskOf(cand, p);
    personRows.push(rm);
    personCols.push(cm);
    for (let i = 0; i < N; i++) {
      if (rm & (1 << i)) rowPersons[i] = rowPersons[i]! | (1 << p);
      if (cm & (1 << i)) colPersons[i] = colPersons[i]! | (1 << p);
    }
  }
  const names = (mask: number) => listOf(maskIndices(mask).map((p) => name(ctx, p)));
  const linesText = (mask: number, byRow: boolean) =>
    `${byRow ? 'rows' : 'columns'} ${listOf(
      maskIndices(mask).map((i) => (byRow ? `${i + 1}` : 'ABCDEFGHI'.charAt(i))),
    )}`;
  const personCells = (mask: number) =>
    maskIndices(mask).flatMap((p) => setCells(candSet(cand, p)));

  for (let k = 2; k <= 4; k++) {
    // Naked: k people confined to k rows (or columns).
    for (const byRow of [true, false]) {
      const masks = byRow ? personRows : personCols;
      const found = enumLocked(masks, k, (set, union) => {
        const rem: Removal = [];
        for (let q = 0; q < PEOPLE; q++) {
          if (set & (1 << q)) continue;
          for (let r = 0; r < N; r++) {
            if (byRow) addRemoval(rem, q, r, union & (1 << r) ? cand[q * N + r]! : 0);
            else addRemoval(rem, q, r, cand[q * N + r]! & union);
          }
        }
        return applyRemoval(
          ctx,
          cand,
          5,
          rem,
          () => personCells(set),
          () =>
            `${names(set)} can only be in ${linesText(union, byRow)}, so nobody else can be in ${byRow ? 'those rows' : 'those columns'}.`,
        );
      });
      if (found) return true;
    }
    // Hidden: k rows (or columns) that only k people can fill.
    for (const byRow of [true, false]) {
      const masks = byRow ? rowPersons : colPersons;
      const found = enumLocked(masks, k, (set, union) => {
        const rem: Removal = [];
        for (const p of maskIndices(union)) {
          for (let r = 0; r < N; r++) {
            if (byRow) addRemoval(rem, p, r, set & (1 << r) ? 0 : cand[p * N + r]!);
            else addRemoval(rem, p, r, cand[p * N + r]! & ~set);
          }
        }
        return applyRemoval(
          ctx,
          cand,
          5,
          rem,
          () => personCells(union),
          () =>
            `Only ${names(union)} can fill ${linesText(set, byRow)}, so they must use ${byRow ? 'those rows' : 'those columns'} and nowhere else.`,
        );
      });
      if (found) return true;
    }
  }
  return false;
}

// --------------------------------------------------------- technique 6: trial

/** Propagate techniques 2-4 silently; false on contradiction. */
function propagate(ctx: Ctx, cand: Cand): boolean {
  const quiet: Ctx = { ...ctx, rec: null };
  for (;;) {
    if (hasContradiction(cand)) return false;
    if (singleCandidate(quiet, cand)) continue;
    if (singles(quiet, cand)) continue;
    if (roomLogic(quiet, cand)) continue;
    return true;
  }
}

function trial(ctx: Ctx, cand: Cand): boolean {
  let any = false;
  const order = Array.from({ length: PEOPLE }, (_, i) => i)
    .map((p) => ({ p, n: countOf(cand, p) }))
    .filter((x) => x.n > 1)
    .sort((a, b) => a.n - b.n);
  for (const { p } of order) {
    for (const cell of setCells(candSet(cand, p))) {
      if (!(cand[p * N + cell.r]! & (1 << cell.c)) || countOf(cand, p) < 2) continue;
      const copy = cand.slice();
      placeAt(copy, p, cell.r, cell.c);
      if (propagate(ctx, copy)) continue;
      const rem: Removal = [];
      addRemoval(rem, p, cell.r, 1 << cell.c);
      applyRemoval(
        ctx,
        cand,
        6,
        rem,
        () => [cell],
        () =>
          `If ${name(ctx, p)} were at ${cellLabel(cell)}, following the clues and rules would lead to a contradiction (two people needing the same row, column or room), so ${name(ctx, p)} cannot be at ${cellLabel(cell)}.`,
      );
      any = true;
    }
  }
  return any;
}

// ------------------------------------------------------------------- driver

const TECHNIQUES: Record<Technique, (ctx: Ctx, cand: Cand) => boolean> = {
  1: clueFiltering,
  2: singleCandidate,
  3: singles,
  4: roomLogic,
  5: lockedSets,
  6: trial,
};

function initialCandidates(ctx: Ctx): Cand {
  const cand = new Uint16Array(PEOPLE * N);
  for (let p = 0; p < PEOPLE; p++) cand.set(ctx.m.board.free, p * N);
  return cand;
}

function isSolved(cand: Cand): boolean {
  let cols = 0;
  let rows = 0;
  for (let p = 0; p < PEOPLE; p++) {
    if (countOf(cand, p) !== 1) return false;
    const r = lowBit(rowMaskOf(cand, p));
    cols |= cand[p * N + r]!;
    rows |= 1 << r;
  }
  return cols === ROW_FULL && rows === ROW_FULL;
}

function run(ctx: Ctx, cand: Cand, maxTechnique: Technique, stop?: () => boolean): void {
  const limit = maxTechnique;
  for (;;) {
    if (stop?.()) return;
    if (hasContradiction(cand) || isSolved(cand)) return;
    let progress = false;
    for (let t = 1; t <= limit; t++) {
      if (TECHNIQUES[t as Technique](ctx, cand)) {
        progress = true;
        break;
      }
      if (stop?.()) return;
    }
    if (!progress) return;
  }
}

function makeCtx(puzzle: Puzzle, explain: boolean): Ctx {
  const m = buildModel(puzzle);
  return {
    m,
    rec: { explain, steps: [], maxTech: 1 },
    nRooms: puzzle.rooms.length,
  };
}

/**
 * Solve the way a person would, using techniques up to `maxTechnique`.
 * Always tries the cheapest applicable technique first. `maxTechniqueUsed`
 * is the hardest technique that had to be applied (grading input).
 */
export function solveLogically(
  puzzle: Puzzle,
  maxTechnique: Technique = 6,
  options: SolveOptions = {},
): SolveResult {
  const ctx = makeCtx(puzzle, options.explain ?? true);
  const cand = initialCandidates(ctx);
  run(ctx, cand, maxTechnique);
  const solved = !hasContradiction(cand) && isSolved(cand);
  return {
    solved,
    steps: ctx.rec!.steps,
    maxTechniqueUsed: ctx.rec!.maxTech as Technique,
    candidates: Array.from({ length: PEOPLE }, (_, p) => candSet(cand, p)),
  };
}

/**
 * Next step a person can act on: the first 'place' deduction for someone not
 * yet placed. Eliminations found on the way (room logic, locked sets, trials)
 * are summarised in front of it, so the explanation reads as a short chain.
 * When the solver narrows someone down to a single cell without recording a
 * placement (the last person, or a finish by elimination) that placement is
 * synthesised. If no placement can be derived, the first elimination beyond
 * plain clue filtering is returned. Null if the board is complete,
 * contradictory, or the solver stalls.
 */
export function nextDeduction(puzzle: Puzzle, state: PlayerState): Deduction | null {
  const ctx = makeCtx(puzzle, true);
  const cand = initialCandidates(ctx);
  clueFiltering(ctx, cand);
  const placedNow = new Set<number>();
  for (let p = 0; p < PEOPLE; p++) {
    const cell = state.placements[p];
    if (!cell) continue;
    if (!(cand[p * N + cell.r]! & (1 << cell.c))) return null; // contradicts the clues
    placeAt(cand, p, cell.r, cell.c);
    placedNow.add(p);
  }
  if (hasContradiction(cand) || placedNow.size === PEOPLE) return null;
  ctx.rec!.steps.length = 0;
  let found: Deduction | null = null;
  const firstPlace = () => {
    found = ctx.rec!.steps.find((d) => d.kind === 'place') ?? null;
    return found !== null;
  };
  run(ctx, cand, 6, firstPlace);
  const steps = ctx.rec!.steps;
  // Eliminations that led here, skipping plain clue filtering (technique 1).
  const chain = (until: Deduction | null) =>
    steps
      .slice(0, until ? steps.indexOf(until) : steps.length)
      .filter((d) => d.kind === 'eliminate' && d.technique >= 4)
      .slice(-3);
  const withChain = (d: Deduction, lead: Deduction[]): Deduction =>
    lead.length === 0
      ? d
      : {
          ...d,
          technique: Math.max(d.technique, ...lead.map((l) => l.technique)) as Technique,
          explanation: `${lead.map((l) => l.explanation).join(' ')} ${d.explanation}`,
          involvedCells: [...lead.flatMap((l) => l.involvedCells), ...d.involvedCells],
        };
  if (found) return withChain(found, chain(found));
  for (let p = 0; p < PEOPLE; p++) {
    if (placedNow.has(p) || countOf(cand, p) !== 1) continue;
    const r = lowBit(rowMaskOf(cand, p));
    const cell = { r, c: lowBit(cand[p * N + r]!) };
    const synthetic: Deduction = {
      technique: 2,
      kind: 'place',
      person: p,
      cells: [cell],
      explanation: `Everywhere else is ruled out for ${name(ctx, p)}, so ${name(ctx, p)} must be at ${cellLabel(cell)}.`,
      involvedCells: [cell],
    };
    return withChain(synthetic, chain(null));
  }
  return steps[0] ?? null;
}
