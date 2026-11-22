import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { generatePuzzle } from '../../src/engine/generator';
import { FURNITURE, FURNITURE_TYPES } from '../../src/engine/furniture';
import { cellKey, type PersonId } from '../../src/engine/types';
import { createGameStore, type GameStore } from '../../src/state/store';
import { createEngineClient, type EngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

const SEED = 'flow-test';
const truth = generatePuzzle(SEED, 'easy');
const solved = truth.solution.cellOf.map((c) => cellKey(c));
const murderer = truth.solution.murdererId;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

async function setup(props: { showRulesOnLoad?: boolean } = {}): Promise<StoreApi<GameStore>> {
  window.history.replaceState(null, '', `/?seed=${SEED}&d=easy`);
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} {...props} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  return store;
}

const click = (id: string) => fireEvent.click(screen.getByTestId(id));
const placeAll = (store: StoreApi<GameStore>, except: PersonId[] = []) =>
  act(() => {
    truth.puzzle.people.forEach((p) => {
      if (!except.includes(p.id)) store.getState().place(p.id, solved[p.id]!);
    });
  });

/** A free, non-solution cell for `person` (so a deliberately wrong placement). */
function wrongCellFor(person: PersonId): number {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const k = cellKey(r, c);
      if (
        k !== solved[person] &&
        !solved.includes(k) &&
        screen.getByTestId(`cell-${r}-${c}`).dataset.blocked === 'false'
      )
        return k;
    }
  throw new Error('no wrong cell');
}

describe('header, rules and new game', () => {
  it('shows difficulty, a timer and the New game / Rules buttons', async () => {
    await setup();
    expect(screen.getByTestId('puzzle-difficulty')).toHaveTextContent('easy');
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00');
    expect(screen.getByTestId('new-game-button')).toBeInTheDocument();
    expect(screen.getByTestId('rules-button')).toBeInTheDocument();
  });

  it('keeps the URL shareable after loading', async () => {
    await setup();
    expect(window.location.search).toBe(`?seed=${SEED}&d=easy`);
  });

  it('rules dialog lists furniture from the catalogue, glossary and shortcuts', async () => {
    await setup();
    click('rules-button');
    const dlg = screen.getByTestId('rules-dialog');
    const standable = within(dlg).getByTestId('rules-standable');
    const blocking = within(dlg).getByTestId('rules-blocking');
    for (const t of FURNITURE_TYPES) {
      const label = FURNITURE[t].label;
      const [inside, outside] = FURNITURE[t].occupiable
        ? [standable, blocking]
        : [blocking, standable];
      expect(inside).toHaveTextContent(label);
      expect(outside).not.toHaveTextContent(new RegExp(`\\b${label}\\b`));
    }
    expect(dlg).toHaveTextContent('Beside');
    expect(dlg).toHaveTextContent('In a corner');
    expect(dlg).toHaveTextContent('Against a wall');
    expect(within(dlg).getByTestId('rules-keys-playing')).not.toHaveTextContent(/hint/i);
    expect(within(dlg).getByTestId('rules-keys-tools')).toHaveTextContent('Cross tool');
    click('rules-close');
    expect(screen.queryByTestId('rules-dialog')).toBeNull();
  });

  it('opens the rules on load when asked to (first visit flag)', async () => {
    await setup({ showRulesOnLoad: true });
    expect(screen.getByTestId('rules-dialog')).toBeInTheDocument();
  });

  it('starts a new game with a seed: Generating…, then URL and puzzle update', async () => {
    const store = await setup();
    click('new-game-button');
    fireEvent.click(screen.getByTestId('newgame-difficulty-easy'));
    fireEvent.change(screen.getByTestId('newgame-seed'), { target: { value: 'other-seed' } });
    click('newgame-start'); // nothing placed: no confirmation
    expect(screen.queryByTestId('newgame-confirm')).toBeNull();
    expect(screen.getByTestId('newgame-generating')).toBeInTheDocument();
    expect(screen.getByTestId('newgame-start')).toBeDisabled();
    await waitFor(() => expect(screen.queryByTestId('newgame-dialog')).toBeNull(), {
      timeout: 20000,
    });
    expect(store.getState().puzzle?.seed).toBe('other-seed');
    expect(window.location.search).toBe('?seed=other-seed&d=easy');
    expect(screen.getByTestId('puzzle-seed')).toHaveTextContent('other-seed');
  });

  it('asks before discarding a game with progress', async () => {
    const store = await setup();
    act(() => void store.getState().place(0, solved[0]!));
    click('new-game-button');
    fireEvent.change(screen.getByTestId('newgame-seed'), { target: { value: 'next-seed' } });
    click('newgame-start');
    expect(screen.getByTestId('newgame-confirm')).toBeInTheDocument();
    click('newgame-confirm-no');
    expect(store.getState().puzzle?.seed).toBe(SEED);
    expect(screen.getByTestId('newgame-dialog')).toBeInTheDocument();
    click('newgame-start');
    click('newgame-confirm-yes');
    await waitFor(() => expect(store.getState().puzzle?.seed).toBe('next-seed'), {
      timeout: 20000,
    });
    expect(store.getState().placements[0]).toBeNull();
  });

  it('a note alone counts as progress', async () => {
    const store = await setup();
    act(() => void store.getState().applyMark([cellKey(0, 0)], 'cross'));
    click('new-game-button');
    click('newgame-start');
    expect(screen.getByTestId('newgame-confirm')).toBeInTheDocument();
  });

  it('shows generation errors in the dialog', async () => {
    const real = createEngineClient({ workerFactory: createInProcessWorker });
    const client: EngineClient = {
      ...real,
      generate: () => Promise.reject(new Error('boom')),
    };
    window.history.replaceState(null, '', '/');
    render(<App store={createGameStore({ client })} />);
    await waitFor(() => expect(screen.getByTestId('puzzle-error')).toBeInTheDocument());
    click('new-game-button');
    click('newgame-start');
    await waitFor(() => expect(screen.getByTestId('newgame-error')).toHaveTextContent('boom'));
    expect(screen.getByTestId('newgame-start')).not.toBeDisabled();
  });
});

describe('hints are retired', () => {
  it('has no Hint button, and H neither asks nor shows anything', async () => {
    await setup();
    expect(screen.queryByTestId('hint-button')).toBeNull();
    fireEvent.keyDown(window, { key: 'h' });
    await act(async () => undefined);
    expect(screen.queryByTestId('hint-panel')).toBeNull();
    expect(document.querySelectorAll('[data-hint]').length).toBe(0);
  });
});

describe('check', () => {
  it('summarises correct and wrong and can mark wrong tokens with an icon', async () => {
    const store = await setup();
    act(() => {
      store.getState().place(1, solved[1]!);
      store.getState().place(2, wrongCellFor(2));
    });
    click('check-button');
    await waitFor(() =>
      expect(screen.getByTestId('check-text')).toHaveTextContent('1 correct, 1 wrong'),
    );
    expect(store.getState().checksUsed).toBe(1);
    expect(screen.queryByTestId('wrong-badge-2')).toBeNull();
    click('check-show-wrong');
    expect(screen.getByTestId('wrong-badge-2')).toBeInTheDocument();
    expect(screen.queryByTestId('wrong-badge-1')).toBeNull();
    click('check-show-wrong');
    expect(screen.queryByTestId('wrong-badge-2')).toBeNull();
    click('check-dismiss');
    expect(screen.queryByTestId('check-summary')).toBeNull();
  });

  it('is disabled until something is placed', async () => {
    await setup();
    expect(screen.getByTestId('check-button')).toBeDisabled();
  });
});

describe('accuse and win', () => {
  it('is enabled only when all nine are placed, and lists the 8 suspects', async () => {
    const store = await setup();
    const btn = screen.getByTestId('accuse-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringContaining('Place all 9'));
    placeAll(store, [3]);
    expect(btn).toBeDisabled();
    placeAll(store);
    expect(btn).toBeEnabled();
    click('accuse-button');
    const victim = truth.puzzle.people.find((p) => p.isVictim)!;
    for (const p of truth.puzzle.people)
      expect(screen.queryByTestId(`accuse-suspect-${p.id}`) !== null).toBe(!p.isVictim);
    expect(screen.queryByTestId(`accuse-suspect-${victim.id}`)).toBeNull();
    expect(screen.getByTestId('accuse-confirm')).toBeDisabled();
  });

  async function accuse(id: PersonId) {
    fireEvent.click(screen.getByTestId(`accuse-suspect-${id}`));
    click('accuse-confirm');
  }
  const other = truth.puzzle.people.find((p) => !p.isVictim && p.id !== murderer)!.id;

  it('wrong placement: generic message, game continues', async () => {
    const store = await setup();
    placeAll(store, [0, 1]);
    act(() => {
      store.getState().place(0, solved[1]!);
      store.getState().place(1, solved[0]!);
    });
    click('accuse-button');
    await accuse(murderer);
    expect(await screen.findByTestId('accuse-result')).toHaveTextContent(
      "Your placement isn't right yet",
    );
    expect(store.getState().status).toBe('playing');
  });

  it('right placement, wrong suspect: tells you to think about the victim’s room', async () => {
    const store = await setup();
    placeAll(store);
    click('accuse-button');
    await accuse(other);
    expect(await screen.findByTestId('accuse-result')).toHaveTextContent(
      "Everyone is in the right place, but that's not the murderer",
    );
    expect(store.getState().status).toBe('playing');
    expect(screen.queryByTestId('win-dialog')).toBeNull();
  });

  it('wins: dialog with stats, share copies the seed link, board becomes read-only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const store = await setup();
    placeAll(store);
    click('check-button');
    await waitFor(() => expect(store.getState().checksUsed).toBe(1));
    click('accuse-button');
    await accuse(murderer);
    const win = await screen.findByTestId('win-dialog');
    expect(store.getState().status).toBe('won');
    expect(store.getState().running).toBe(false);
    expect(within(win).queryByTestId('win-hints')).toBeNull();
    expect(within(win).getByTestId('win-checks')).toHaveTextContent('1');
    expect(within(win).getByTestId('win-assists')).toHaveTextContent('0');
    expect(within(win).getByTestId('win-difficulty')).toHaveTextContent('easy');
    expect(within(win).getByTestId('win-time')).toHaveTextContent(/^\d\d:\d\d$/);
    expect(warn).not.toHaveBeenCalled();
    click('win-share');
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = new URL(writeText.mock.calls[0]![0] as string);
    expect(url.searchParams.get('seed')).toBe(SEED);
    expect(url.searchParams.get('d')).toBe('easy');
    expect(screen.getByTestId('win-share-status')).toHaveTextContent('copied');

    // read-only afterwards
    click('win-close');
    expect(screen.getByTestId('board')).toHaveAttribute('data-solved', 'true');
    expect(screen.getByTestId('solved-banner')).toBeInTheDocument();
    expect(screen.getByTestId('check-button')).toBeDisabled();
    expect(screen.getByTestId('accuse-button')).toBeDisabled();
    expect(store.getState().place(0, wrongCellFor(0))).toBe('refused');
    expect(store.getState().remove(0)).toBe(false);
    expect(store.getState().undo()).toBe(false);
    fireEvent.click(screen.getByTestId('person-card-1'));
    const [r, c] = [0, 0].map(() => 0);
    fireEvent.click(screen.getByTestId(`cell-${r}-${c}`));
    expect(store.getState().placements[1]).toBe(solved[1]);
    // results can be reopened
    click('solved-results');
    expect(screen.getByTestId('win-dialog')).toBeInTheDocument();
  });

  it('falls back to a textarea copy when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    const store = await setup();
    placeAll(store);
    click('accuse-button');
    await accuse(murderer);
    await screen.findByTestId('win-dialog');
    click('win-share');
    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    expect(screen.getByTestId('win-share-status')).toHaveTextContent('copied');
  });

  it('warns but still shows the win when the local hash disagrees with the worker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = await setup();
    placeAll(store);
    act(() => store.setState((s) => ({ puzzle: { ...s.puzzle!, solutionHash: 'bad' } })));
    click('accuse-button');
    await accuse(murderer);
    await screen.findByTestId('win-dialog');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('solution hash'));
  });

  it('New game from the win dialog opens the new game dialog', async () => {
    const store = await setup();
    placeAll(store);
    click('accuse-button');
    await accuse(murderer);
    await screen.findByTestId('win-dialog');
    click('win-new-game');
    expect(screen.queryByTestId('win-dialog')).toBeNull();
    expect(screen.getByTestId('newgame-dialog')).toBeInTheDocument();
  });
});
