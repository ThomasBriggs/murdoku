import { beforeAll, describe, expect, it } from 'vitest';
import { generatePuzzle } from '../../src/engine/generator';
import { hashPlacement } from '../../src/engine/secure';
import { cellKey } from '../../src/engine/types';
import { createWorkerState, handleRequest } from '../../src/worker/handler';
import type { EngineResponse, Placements } from '../../src/worker/protocol';

const SEED = 'cy-test';
const truth = generatePuzzle(SEED, 'easy');
const solved: Record<number, number> = {};
truth.solution.cellOf.forEach((c, i) => (solved[i] = cellKey(c)));

function keysDeep(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  return out;
}

let id = 0;
async function send(state: ReturnType<typeof createWorkerState>, body: object) {
  return handleRequest(state, { id: ++id, ...body } as never);
}
function expectType<T extends EngineResponse['type']>(r: EngineResponse, t: T) {
  expect(r.type).toBe(t);
  return r as Extract<EngineResponse, { type: T }>;
}

describe('worker handler', () => {
  const state = createWorkerState();
  beforeAll(async () => {
    expectType(await send(state, { type: 'generate', seed: SEED, difficulty: 'easy' }), 'generate');
  });

  it('errors before generate', async () => {
    const fresh = createWorkerState();
    for (const body of [
      { type: 'check', placements: {} },
      { type: 'hint', placements: {} },
      { type: 'accuse', placements: {}, suspectId: 0 },
    ]) {
      const r = expectType(await send(fresh, body), 'error');
      expect(r.code).toBe('not-generated');
    }
  });

  it('generate returns a PuzzleView with no solution data', async () => {
    const r = expectType(
      await send(state, { type: 'generate', seed: SEED, difficulty: 'easy' }),
      'generate',
    );
    const keys = keysDeep(r);
    for (const k of ['solution', 'cellOf', 'murdererId']) expect(keys.has(k)).toBe(false);
    expect(r.puzzle.solutionHash).toBe(await hashPlacement(SEED, truth.solution.cellOf));
    expect(r.puzzle.seed).toBe(SEED);
    expect(r.puzzle.clues.length).toBeGreaterThan(0);
  });

  it('rejects a bad generate request', async () => {
    const r = expectType(
      await send(state, { type: 'generate', seed: 'x', difficulty: 'nope' }),
      'error',
    );
    expect(r.code).toBe('bad-request');
    await send(state, { type: 'generate', seed: SEED, difficulty: 'easy' });
  });

  it('check splits placed people into correct and wrong', async () => {
    const wrongKey = (solved[1]! + 1) % 81 === solved[1] ? 0 : (solved[1]! + 10) % 81;
    const placements: Placements = { 0: solved[0]!, 1: wrongKey };
    const r = expectType(await send(state, { type: 'check', placements }), 'check');
    expect(r.correct).toEqual([0]);
    expect(r.wrong).toEqual([1]);
  });

  it('rejects out-of-range cell keys', async () => {
    const r = expectType(await send(state, { type: 'check', placements: { 0: 999 } }), 'error');
    expect(r.code).toBe('bad-request');
  });

  it('hint: deduction when correct, wrong count otherwise', async () => {
    const ok = expectType(
      await send(state, { type: 'hint', placements: { 0: solved[0]! } }),
      'hint',
    );
    expect(ok.result.type).toBe('deduction');
    const empty = expectType(await send(state, { type: 'hint', placements: {} }), 'hint');
    expect(empty.result.type).toBe('deduction');

    const bad: Placements = { 0: (solved[0]! + 10) % 81, 1: (solved[1]! + 10) % 81 };
    const w = expectType(await send(state, { type: 'hint', placements: bad }), 'hint');
    expect(w.result).toEqual({ type: 'wrong', count: 2 });
    const rev = expectType(
      await send(state, { type: 'hint', placements: bad, revealOne: true }),
      'hint',
    );
    expect(rev.result.type === 'wrong' && [0, 1].includes(rev.result.person!)).toBe(true);
  });

  it('accuse reports placement and accusation separately', async () => {
    const { murdererId } = truth.solution;
    const other = (murdererId + 1) % 9;
    const win = expectType(
      await send(state, { type: 'accuse', placements: solved, suspectId: murdererId }),
      'accuse',
    );
    expect(win).toMatchObject({ placementCorrect: true, accusationCorrect: true, won: true });
    const wrongSuspect = expectType(
      await send(state, { type: 'accuse', placements: solved, suspectId: other }),
      'accuse',
    );
    expect(wrongSuspect).toMatchObject({
      placementCorrect: true,
      accusationCorrect: false,
      won: false,
    });
    const partial = expectType(
      await send(state, { type: 'accuse', placements: { 0: solved[0]! }, suspectId: murdererId }),
      'accuse',
    );
    expect(partial).toMatchObject({ placementCorrect: false, accusationCorrect: true, won: false });
  });
});
