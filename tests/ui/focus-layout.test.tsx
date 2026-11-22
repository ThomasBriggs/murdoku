import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { generatePuzzle } from '../../src/engine/generator';
import { cellKey } from '../../src/engine/types';
import { createGameStore, type GameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import { panelOrder } from '../../src/ui/types';
import { clickMore } from './more';
import { stubWidth } from './matchMedia';

const SEED = 'focus-test';
const truth = generatePuzzle(SEED, 'easy');
const solved = truth.solution.cellOf.map((c) => cellKey(c));
const COLLAPSE_KEY = 'murdoku:v1:placed-collapsed';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  // @ts-expect-error jsdom has no matchMedia; remove our stub
  delete window.matchMedia;
  vi.restoreAllMocks();
});

async function setup(): Promise<StoreApi<GameStore>> {
  window.history.replaceState(null, '', `/?seed=${SEED}&d=easy`);
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  return store;
}

const place = (store: StoreApi<GameStore>, ids: number[]) =>
  act(() => {
    for (const id of ids) store.getState().place(id, solved[id]!);
  });
const ids = () => truth.puzzle.people.map((p) => p.id);
const heading = (testId: string) => screen.getByTestId(testId).querySelector('h3')!.textContent;
const idsIn = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByTestId(/^person-card-/)
    .map((el) =>
      Number(
        el.dataset.testid?.replace('person-card-', '') ??
          el.getAttribute('data-testid')!.replace('person-card-', ''),
      ),
    );

describe('clue list: Unplaced / Placed', () => {
  it('starts with everyone unplaced, counts shown, and no Placed section', async () => {
    await setup();
    expect(heading('clues-unplaced')).toBe('Unplaced(9)');
    expect(screen.queryByTestId('clues-placed')).toBeNull();
    expect(screen.queryByTestId('clues-all-placed')).toBeNull();
  });

  it('moves a placed person into Placed and updates both counts', async () => {
    const store = await setup();
    place(store, [0, 3]);
    expect(heading('clues-unplaced')).toBe('Unplaced(7)');
    expect(heading('clues-placed')).toBe('▾Placed(2)');
    expect(idsIn('clues-placed').sort()).toEqual([0, 3]);
    expect(idsIn('clues-unplaced')).not.toContain(0);
    expect(screen.getByTestId('clues-count')).toHaveTextContent('7');
  });

  it('a tentative (pencil) guess still counts as unplaced', async () => {
    const store = await setup();
    const free = document.querySelector<HTMLElement>('[data-blocked="false"]')!;
    act(() => {
      store.getState().placeTentative(0, cellKey(Number(free.dataset.r), Number(free.dataset.c)));
    });
    expect(heading('clues-unplaced')).toBe('Unplaced(9)');
    expect(screen.queryByTestId('clues-placed')).toBeNull();
    expect(screen.getByTestId('person-status-0')).toHaveTextContent(/^Guess /);
  });

  it('shows the all-placed message instead of an empty Unplaced list', async () => {
    const store = await setup();
    place(store, ids());
    expect(screen.getByTestId('clues-all-placed')).toBeInTheDocument();
    expect(heading('clues-unplaced')).toBe('Unplaced(0)');
    expect(heading('clues-placed')).toBe('▾Placed(9)');
  });

  it('the Placed toggle collapses the list, sets aria-expanded and persists', async () => {
    const store = await setup();
    place(store, [0]);
    const toggle = screen.getByTestId('clues-placed-toggle');
    const list = screen.getByTestId('clues-placed-list');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(list).not.toHaveAttribute('hidden');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(list).toHaveAttribute('hidden');
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe('1');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe('0');
  });

  it('starts collapsed when that was stored', async () => {
    window.localStorage.setItem(COLLAPSE_KEY, '1');
    const store = await setup();
    place(store, [0]);
    expect(screen.getByTestId('clues-placed-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('clues-placed-list')).toHaveAttribute('hidden');
  });

  it('still works when localStorage throws', async () => {
    const store = await setup();
    place(store, [0]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    fireEvent.click(screen.getByTestId('clues-placed-toggle'));
    expect(screen.getByTestId('clues-placed-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the 1-9 shortcut numbers of the full list, whichever section a card is in', async () => {
    const store = await setup();
    const order = panelOrder(truth.puzzle.people);
    place(store, [order[0]!.id, order[4]!.id]);
    order.forEach((p, i) => {
      const head = screen.getByTestId(`person-card-${p.id}`).querySelector('button')!;
      expect(head).toHaveAttribute('aria-keyshortcuts', String(i + 1));
    });
    // The victim (first in order) is in Placed but still key 1.
    expect(idsIn('clues-placed')).toContain(order[0]!.id);
  });
});

describe('clues drawer', () => {
  it.each([1280, 1000, 700])('is always shown at %ipx, with no toggle', async (w) => {
    stubWidth(w);
    await setup();
    const drawer = screen.getByTestId('clues-drawer');
    expect(drawer).toBeVisible();
    expect(drawer).not.toHaveAttribute('hidden');
    expect(screen.queryByTestId('clues-toggle')).toBeNull();
    expect(screen.queryByTestId('clues-close')).toBeNull();
    expect(screen.getByTestId('game')).not.toHaveAttribute('data-clues');
  });

  it('the drawer heading badge shows the unplaced count and follows placements', async () => {
    const store = await setup();
    expect(screen.getByTestId('clues-count')).toHaveTextContent('9');
    expect(screen.getByTestId('clues-count')).toHaveAttribute('aria-label', '9 unplaced');
    place(store, [1, 2, 3]);
    expect(screen.getByTestId('clues-count')).toHaveTextContent('6');
  });

  it('on a phone the clues are still shown, below the board, and the bottom bar has no clues button', async () => {
    stubWidth(375);
    await setup();
    expect(screen.queryByTestId('dock')).toBeNull();
    expect(screen.getByTestId('more-button')).toBeInTheDocument();
    expect(screen.queryByTestId('clues-toggle')).toBeNull();
    expect(screen.queryByTestId('clues-grabber')).toBeNull();
    expect(screen.queryByTestId('clues-backdrop')).toBeNull();
    const drawer = screen.getByTestId('clues-drawer');
    expect(drawer).toBeVisible();
    expect(within(drawer).getByTestId('clues-count')).toHaveTextContent('9');
    // Picking a person does not hide the clues.
    const order = panelOrder(truth.puzzle.people);
    fireEvent.click(screen.getByTestId(`person-card-${order[1]!.id}`).querySelector('button')!);
    expect(screen.getByTestId('clues-drawer')).toBeVisible();
  });
});

describe('scratchpad button on a phone', () => {
  it('sits in the clue header (no floating button), opens the panel and returns focus on close', async () => {
    stubWidth(375);
    await setup();
    const trigger = screen.getByTestId('scratchpad-toggle');
    expect(trigger).toHaveAttribute('aria-label', 'Scratchpad');
    expect(within(screen.getByTestId('clues-drawer')).getByTestId('scratchpad-toggle')).toBe(
      trigger,
    );
    expect(screen.getAllByTestId('scratchpad-toggle')).toHaveLength(1);
    fireEvent.click(trigger);
    const panel = screen.getByTestId('scratchpad-panel');
    expect(panel).toBeInTheDocument();
    fireEvent.click(within(panel).getByTestId('scratchpad-toggle'));
    expect(screen.queryByTestId('scratchpad-panel')).toBeNull();
    expect(
      within(screen.getByTestId('clues-drawer')).getByTestId('scratchpad-toggle'),
    ).toHaveFocus();
  });

  it('keeps the floating button on desktop', async () => {
    stubWidth(1280);
    await setup();
    expect(
      within(screen.getByTestId('clues-drawer')).queryByTestId('scratchpad-toggle'),
    ).toBeNull();
    expect(screen.getByTestId('scratchpad-toggle')).toBeInTheDocument();
  });
});

describe('dock and overflow menu', () => {
  it('tool buttons reflect the active tool through aria-pressed', async () => {
    const store = await setup();
    const dock = within(screen.getByTestId('dock'));
    expect(dock.getByTestId('tool-place')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dock.getByTestId('tool-cross'));
    expect(store.getState().tool).toBe('cross');
    expect(dock.getByTestId('tool-cross')).toHaveAttribute('aria-pressed', 'true');
    expect(dock.getByTestId('tool-place')).toHaveAttribute('aria-pressed', 'false');
  });

  it('undo and redo in the dock follow the history', async () => {
    const store = await setup();
    expect(screen.getByTestId('undo')).toBeDisabled();
    place(store, [0]);
    expect(screen.getByTestId('undo')).toBeEnabled();
    fireEvent.click(screen.getByTestId('undo'));
    expect(screen.getByTestId('redo')).toBeEnabled();
  });

  it('the ⋯ button opens the overflow menu with its items; Escape closes it', async () => {
    await setup();
    const btn = screen.getByTestId('overflow-button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const menu = within(screen.getByTestId('overflow-menu'));
    for (const id of [
      'reset',
      'layers-button',
      'clear-button',
      'whatif-start',
      'logic-toggle',
      'print-button',
    ])
      expect(menu.getByTestId(id)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('overflow-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('overflow-menu')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('overflow items work and close the menu', async () => {
    const store = await setup();
    clickMore('whatif-start');
    expect(store.getState().whatIfStack).toHaveLength(1);
    expect(screen.queryByTestId('overflow-menu')).toBeNull();
    clickMore('logic-toggle');
    expect(screen.getByTestId('logic-grid')).toBeInTheDocument();
  });

  it('Check and Accuse sit beside the board, not in the overflow menu', async () => {
    await setup();
    const group = within(screen.getByRole('group', { name: 'Investigate' }));
    for (const id of ['check-button', 'accuse-button'])
      expect(group.getByTestId(id)).toBeInTheDocument();
    expect(screen.queryByTestId('hint-button')).toBeNull();
  });

  it('on a phone Check sits on the quick bar between the quick actions and undo; Accuse waits for everyone', async () => {
    stubWidth(375);
    const store = await setup();
    const checks = screen.getAllByTestId('check-button');
    expect(checks).toHaveLength(1);
    const check = checks[0]!;
    const undo = screen.getByTestId('undo');
    expect(check.parentElement).toBe(undo.parentElement);
    expect(check.compareDocumentPosition(undo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // a divider on each side of Check
    expect(check.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
    expect(check.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
    expect(check.previousElementSibling?.previousElementSibling).not.toBeNull();
    expect(check).toHaveAccessibleName('Check');
    expect(screen.queryByTestId('accuse-button')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Investigate' })).toBeNull();
    // no room is kept for the strip until it shows
    expect(screen.getByTestId('game').className).not.toMatch(/layoutAccuse/);
    place(store, ids().slice(0, -1));
    expect(screen.queryByTestId('accuse-button')).toBeNull();
    place(store, ids().slice(-1));
    expect(screen.getByTestId('game').className).toMatch(/layoutAccuse/);
    const group = within(screen.getByRole('group', { name: 'Investigate' }));
    expect(group.getByTestId('accuse-button')).toBeEnabled();
    expect(group.queryByTestId('check-button')).toBeNull();
  });

  it('the furniture key is a collapsible section at the foot of the clue drawer', async () => {
    await setup();
    const section = screen.getByTestId('furniture-key');
    expect(within(screen.getByTestId('clues-drawer')).getByTestId('furniture-key')).toBe(section);
    expect(section).not.toHaveAttribute('open');
    expect(screen.queryByTestId('furniture-legend')).toBeNull();
    fireEvent.click(screen.getByTestId('key-toggle'));
    expect(section).toHaveAttribute('open');
    expect(await screen.findByTestId('furniture-legend')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('key-toggle'));
    await waitFor(() => expect(screen.queryByTestId('furniture-legend')).toBeNull());
  });
});

describe('removed UI', () => {
  it('has no row or column note fields', async () => {
    await setup();
    for (let i = 0; i < 9; i++) {
      expect(screen.queryByTestId(`row-note-${i}`)).toBeNull();
      expect(screen.queryByTestId(`col-note-${i}`)).toBeNull();
    }
  });
});
