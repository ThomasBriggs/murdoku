import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from '../../src/engine/constants';
import { emptyAnnotations } from '../../src/state/annotations';
import { toSavedGame, type SavedGame } from '../../src/state/persistence';
import { decideStartup } from '../../src/state/startup';
import { startedStore, wrongCells } from './persistence-helpers';

async function save(
  over: Partial<SavedGame> = {},
  progress: 'none' | 'marks' | 'placement' = 'placement',
): Promise<SavedGame> {
  const store = await startedStore('saved', 'easy');
  if (progress === 'placement') store.getState().place(0, wrongCells(store, 1)[0]!);
  if (progress === 'marks') store.getState().applyMark([wrongCells(store, 1)[0]!], 'cross');
  return { ...toSavedGame(store.getState())!, ...over };
}
const V = GENERATOR_VERSION;
const same = { seed: 'saved', difficulty: 'easy' as const };
const other = { seed: 'shared', difficulty: 'hard' as const };

describe('startup decision table', () => {
  it('no save, no URL: new random medium game', () => {
    expect(decideStartup(null, null, V)).toEqual({
      kind: 'new',
      difficulty: 'medium',
      discardSave: false,
    });
  });
  it('no save, URL: start the URL puzzle', () => {
    expect(decideStartup(other, null, V)).toMatchObject({ kind: 'start', ...other });
  });
  it('save, no URL: resume', async () => {
    const s = await save();
    expect(decideStartup(null, s, V)).toEqual({ kind: 'resume', save: s });
  });
  it('save, URL matches seed and difficulty: resume', async () => {
    const s = await save();
    expect(decideStartup(same, s, V).kind).toBe('resume');
  });
  it('same seed but different difficulty is a different puzzle', async () => {
    const s = await save();
    expect(decideStartup({ seed: 'saved', difficulty: 'hard' }, s, V).kind).toBe('choose');
  });
  it('save with progress, other URL: ask', async () => {
    const s = await save();
    expect(decideStartup(other, s, V)).toEqual({ kind: 'choose', save: s, url: other });
  });
  it('marks alone count as progress', async () => {
    expect(decideStartup(other, await save({}, 'marks'), V).kind).toBe('choose');
  });
  it('save without progress, other URL: start the URL puzzle', async () => {
    expect(decideStartup(other, await save({}, 'none'), V)).toMatchObject({
      kind: 'start',
      discardSave: false,
    });
  });
  it('won save, other URL: start the URL puzzle', async () => {
    expect(decideStartup(other, await save({ status: 'won' }), V).kind).toBe('start');
  });
  it('won save, no URL: resume (shown solved)', async () => {
    expect(decideStartup(null, await save({ status: 'won' }), V).kind).toBe('resume');
  });
  it('outdated save, no URL: outdated dialog', async () => {
    const s = await save({ generatorVersion: V + 1 });
    expect(decideStartup(null, s, V)).toEqual({ kind: 'outdated', save: s, url: null });
  });
  it('outdated save, URL of the same puzzle: outdated dialog', async () => {
    const s = await save({ generatorVersion: V + 1 });
    expect(decideStartup(same, s, V).kind).toBe('outdated');
  });
  it('outdated save, other URL: start the URL puzzle and discard the save', async () => {
    const s = await save({ generatorVersion: V + 1 });
    expect(decideStartup(other, s, V)).toMatchObject({ kind: 'start', discardSave: true });
  });
  it('annotations helper sanity', () => {
    expect(emptyAnnotations().scratchpad).toBe('');
  });
});
