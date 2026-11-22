import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { createGameStore, type GameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import type { StoreApi } from 'zustand/vanilla';
import { clickMore } from './more';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

async function setup(): Promise<StoreApi<GameStore>> {
  window.history.pushState({}, '', '/?seed=ui-test&d=easy');
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  return store;
}

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
const card = (id: number) => screen.getByTestId(`person-card-${id}`);
/** Commit a placement: Enter on the cell (a mouse or finger presses and holds instead). */
const place = (r: number, c: number) => fireEvent.keyDown(cell(r, c), { key: 'Enter' });

function freeCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (cell(r, c).dataset.blocked === 'false') out.push([r, c]);
  return out;
}

describe('Board UI', () => {
  let store: StoreApi<GameStore>;
  beforeAll(() => undefined);

  it('shows Generating… then the board with 81 labelled cells', async () => {
    window.history.pushState({}, '', '/?seed=ui-test&d=easy');
    const s = createGameStore({
      client: createEngineClient({ workerFactory: createInProcessWorker }),
    });
    render(<App store={s} />);
    expect(screen.getByTestId('generating')).toHaveTextContent('Generating');
    await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), {
      timeout: 20000,
    });
    expect(screen.queryByTestId('generating')).toBeNull();
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell');
    expect(cells).toHaveLength(81);
    expect(cell(2, 3).getAttribute('aria-label')).toMatch(
      /^Row 3, column D, .+, .+, (empty|blocked)$/,
    );
    expect(screen.getByTestId('puzzle-seed')).toHaveTextContent('ui-test');
    // one room label per room
    const rooms = new Set(cells.map((c) => c.dataset.room));
    expect(
      cells.filter((c) => c.querySelector('span[aria-hidden]:not(svg)')).length,
    ).toBeGreaterThan(0);
    expect(rooms.size).toBeGreaterThan(2);
  });

  it('lists the victim first, then suspects, with clues', async () => {
    store = await setup();
    const puzzle = store.getState().puzzle!;
    fireEvent.click(screen.getByTestId('clues-toggle')); // the drawer starts closed in jsdom
    const items = within(screen.getByTestId('clues-unplaced')).getAllByRole('listitem');
    expect(items).toHaveLength(9);
    const victim = puzzle.people.find((p) => p.isVictim)!;
    expect(items[0]).toBe(card(victim.id));
    expect(items[0]).toHaveTextContent('Victim');
    const suspect = puzzle.people.find((p) => !p.isVictim)!;
    expect(screen.getByTestId(`person-clue-${suspect.id}`).textContent).toMatch(/was /);
    // The victim has no clue of their own, only the murder rule.
    expect(screen.getByTestId(`person-clue-${victim.id}`)).toHaveTextContent(
      'Was alone in the room with the murderer.',
    );
  });

  it('selects a person, places, then removes via own cell', async () => {
    store = await setup();
    const [r, c] = freeCells()[0]!;
    fireEvent.click(card(0));
    expect(card(0)).toHaveAttribute('data-selected', 'true');
    place(r, c);
    expect(store.getState().placements[0]).toBe(r * 9 + c);
    expect(screen.getByTestId('token-0')).toBeInTheDocument();
    expect(cell(r, c).getAttribute('aria-label')).toMatch(/, [A-Z][a-z]+$/);
    expect(card(0)).toHaveAttribute('data-selected', 'false');

    // no selection + click on occupied cell selects the person
    fireEvent.click(cell(r, c));
    expect(card(0)).toHaveAttribute('data-selected', 'true');
    // selected: a tap on their own cell changes nothing, placing there again removes
    fireEvent.click(cell(r, c));
    expect(store.getState().placements[0]).toBe(r * 9 + c);
    place(r, c);
    expect(store.getState().placements[0]).toBeNull();
    expect(screen.queryByTestId('token-0')).toBeNull();
  });

  it('refuses a blocking cell and shakes it', async () => {
    store = await setup();
    let blocked: [number, number] | null = null;
    for (let r = 0; r < 9 && !blocked; r++)
      for (let c = 0; c < 9; c++)
        if (cell(r, c).dataset.blocked === 'true') {
          blocked = [r, c];
          break;
        }
    expect(blocked).not.toBeNull();
    fireEvent.click(card(1));
    fireEvent.click(cell(blocked![0], blocked![1]));
    expect(store.getState().placements[1]).toBeNull();
    expect(card(1)).toHaveAttribute('data-selected', 'true');
    await waitFor(() => expect(cell(blocked![0], blocked![1]).className).toMatch(/shake/));
  });

  it('undoes and redoes via buttons and keyboard, and resets via the dialog', async () => {
    store = await setup();
    const [r, c] = freeCells()[0]!;
    fireEvent.click(card(2));
    place(r, c);
    expect(screen.getByTestId('undo')).toBeEnabled();
    fireEvent.click(screen.getByTestId('undo'));
    expect(store.getState().placements[2]).toBeNull();
    fireEvent.click(screen.getByTestId('redo'));
    expect(store.getState().placements[2]).toBe(r * 9 + c);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(store.getState().placements[2]).toBeNull();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(store.getState().placements[2]).toBe(r * 9 + c);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(store.getState().placements[2]).toBe(r * 9 + c);

    clickMore('reset');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancel-reset'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().placements[2]).not.toBeNull();
    clickMore('reset');
    fireEvent.click(screen.getByTestId('confirm-reset'));
    expect(store.getState().placements[2]).toBeNull();
  });

  it('supports keyboard: arrows, number keys, Enter, Escape', async () => {
    store = await setup();
    const grid = screen.getByRole('grid');
    act(() => cell(0, 0).focus());
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(cell(1, 1)).toHaveFocus();
    expect(cell(1, 1)).toHaveAttribute('tabindex', '0');
    expect(cell(0, 0)).toHaveAttribute('tabindex', '-1');
    // find a free cell and walk to it
    const [r, c] = freeCells()[0]!;
    act(() => cell(r, c).focus());
    fireEvent.keyDown(grid, { key: '1' });
    const first = store.getState().puzzle!.people.find((p) => p.isVictim)!.id;
    expect(store.getState().selectedPerson).toBe(first);
    fireEvent.keyDown(grid, { key: ' ' }); // Space notes a candidate
    expect(store.getState().placements[first]).toBeNull();
    expect(cell(r, c)).toHaveAttribute('data-candidates', String(first));
    fireEvent.keyDown(grid, { key: 'Enter' }); // Enter places
    expect(store.getState().placements[first]).toBe(r * 9 + c);
    fireEvent.keyDown(grid, { key: '2' });
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(store.getState().selectedPerson).toBeNull();
  });

  it('derives auto-cross cells from placements and honours the setting', async () => {
    store = await setup();
    const [r, c] = freeCells()[0]!;
    fireEvent.click(card(0));
    place(r, c);
    const crossed = () => document.querySelectorAll('[data-autocross="true"]');
    expect(crossed()).toHaveLength(16);
    expect(cell(r, c)).not.toHaveAttribute('data-autocross');
    const other = (c + 1) % 9;
    expect(cell(r, other)).toHaveAttribute('data-autocross', 'true');
    clickMore('settings-button');
    fireEvent.click(screen.getByTestId('setting-autocross'));
    expect(crossed()).toHaveLength(0);
    expect(store.getState().settings.autoCross).toBe(false);
    fireEvent.click(screen.getByTestId('setting-autocross'));
    fireEvent.click(screen.getByTestId('undo'));
    expect(crossed()).toHaveLength(0);
  });

  it('marks conflicting people with an icon and description, and can switch it off', async () => {
    store = await setup();
    const [r1, c1] = freeCells()[0]!;
    const [r2, c2] = freeCells().find(([r, c]) => r === r1 && c !== c1)!;
    for (const [id, r, c] of [
      [0, r1, c1],
      [1, r2, c2],
    ] as const) {
      fireEvent.click(card(id));
      place(r, c);
    }
    expect(screen.getByTestId('conflict-badge-0')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-badge-1')).toBeInTheDocument();
    const desc = cell(r1, c1).getAttribute('aria-describedby')!;
    expect(document.getElementById(desc)!.textContent).not.toBe('');
    clickMore('settings-button');
    fireEvent.click(screen.getByTestId('setting-conflicts'));
    expect(screen.queryByTestId('conflict-badge-0')).toBeNull();
  });

  it('highlights matching cells while a clue word is hovered', async () => {
    store = await setup();
    const puzzle = store.getState().puzzle!;
    const roomWord = document.querySelector<HTMLElement>('[data-testid^="clue-room-"]');
    expect(roomWord).not.toBeNull();
    const roomId = Number(roomWord!.dataset.testid!.replace('clue-room-', ''));
    fireEvent.mouseEnter(roomWord!);
    const lit = document.querySelectorAll('[data-highlight="true"]');
    const expected = puzzle.roomOf.flat().filter((id) => id === roomId).length;
    expect(lit).toHaveLength(expected);
    fireEvent.mouseLeave(roomWord!);
    expect(document.querySelectorAll('[data-highlight="true"]')).toHaveLength(0);
  });

  it('strikes through a placed name and lights up a hovered person on the board', async () => {
    store = await setup();
    const free = freeCells();
    const [a, b, c2, d] = [free[0]!, free[10]!, free[20]!, free[30]!];
    const key = ([r, c]: [number, number]) => r * 9 + c;
    act(() => {
      store.getState().place(1, key(a));
      store.getState().placeTentative(2, key(b));
      store.getState().applyCandidate([key(c2), key(d)], 2);
    });
    expect(screen.getByTestId('person-name-1')).toHaveAttribute('data-placed', 'true');
    expect(screen.getByTestId('person-name-2')).not.toHaveAttribute('data-placed');

    fireEvent.mouseEnter(card(1));
    expect(cell(...a)).toHaveAttribute('data-person-mark', 'placed');
    expect(document.querySelectorAll('[data-person-mark]')).toHaveLength(1);
    fireEvent.mouseLeave(card(1));

    fireEvent.mouseEnter(card(2));
    expect(cell(...b)).toHaveAttribute('data-person-mark', 'tentative');
    expect(cell(...c2)).toHaveAttribute('data-person-mark', 'candidate');
    expect(cell(...d)).toHaveAttribute('data-person-mark', 'candidate');
    expect(document.querySelectorAll('[data-person-mark]')).toHaveLength(3);
    fireEvent.mouseLeave(card(2));
    expect(document.querySelectorAll('[data-person-mark]')).toHaveLength(0);
  });

  it('shows a room legend whose hover highlights the room', async () => {
    store = await setup();
    const puzzle = store.getState().puzzle!;
    const items = within(screen.getByTestId('room-legend')).getAllByRole('listitem');
    expect(items).toHaveLength(puzzle.rooms.length);
    const room = puzzle.rooms[0]!;
    expect(items[0]).toHaveTextContent(room.name);
    fireEvent.mouseEnter(items[0]!);
    expect(document.querySelectorAll('[data-highlight="true"]')).toHaveLength(room.cells.length);
    fireEvent.mouseLeave(items[0]!);
    expect(document.querySelectorAll('[data-highlight="true"]')).toHaveLength(0);
  });

  it('marks the victim token and applies the theme to <html>', async () => {
    store = await setup();
    const victim = store.getState().puzzle!.people.find((p) => p.isVictim)!;
    expect(screen.getByTestId(`card-victim-badge-${victim.id}`)).toBeInTheDocument();
    clickMore('settings-button');
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
