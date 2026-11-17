import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { createGameStore, type GameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import type { StoreApi } from 'zustand/vanilla';

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
    const items = within(screen.getByTestId('people-panel')).getAllByRole('listitem');
    expect(items).toHaveLength(9);
    const victim = puzzle.people.find((p) => p.isVictim)!;
    expect(items[0]).toBe(card(victim.id));
    expect(items[0]).toHaveTextContent('Victim');
    const suspect = puzzle.people.find((p) => !p.isVictim)!;
    expect(screen.getByTestId(`person-clue-${suspect.id}`).textContent).toMatch(/was /);
  });

  it('selects a person, places by click, then removes via own cell', async () => {
    store = await setup();
    const [r, c] = freeCells()[0]!;
    fireEvent.click(card(0));
    expect(card(0)).toHaveAttribute('data-selected', 'true');
    fireEvent.click(cell(r, c));
    expect(store.getState().placements[0]).toBe(r * 9 + c);
    expect(screen.getByTestId('token-0')).toBeInTheDocument();
    expect(cell(r, c).getAttribute('aria-label')).toMatch(/, [A-Z][a-z]+$/);
    expect(card(0)).toHaveAttribute('data-selected', 'false');

    // no selection + click on occupied cell selects the person
    fireEvent.click(cell(r, c));
    expect(card(0)).toHaveAttribute('data-selected', 'true');
    // selected + own cell removes
    fireEvent.click(cell(r, c));
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
    fireEvent.click(cell(r, c));
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

    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancel-reset'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().placements[2]).not.toBeNull();
    fireEvent.click(screen.getByTestId('reset'));
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
    fireEvent.keyDown(grid, { key: ' ' });
    expect(store.getState().placements[first]).toBe(r * 9 + c);
    fireEvent.keyDown(grid, { key: '2' });
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(store.getState().selectedPerson).toBeNull();
  });

  it('derives auto-cross cells from placements and honours the setting', async () => {
    store = await setup();
    const [r, c] = freeCells()[0]!;
    fireEvent.click(card(0));
    fireEvent.click(cell(r, c));
    const crossed = () => document.querySelectorAll('[data-autocross="true"]');
    expect(crossed()).toHaveLength(16);
    expect(cell(r, c)).not.toHaveAttribute('data-autocross');
    const other = (c + 1) % 9;
    expect(cell(r, other)).toHaveAttribute('data-autocross', 'true');
    fireEvent.click(screen.getByTestId('settings-button'));
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
      fireEvent.click(cell(r, c));
    }
    expect(screen.getByTestId('conflict-badge-0')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-badge-1')).toBeInTheDocument();
    const desc = cell(r1, c1).getAttribute('aria-describedby')!;
    expect(document.getElementById(desc)!.textContent).not.toBe('');
    fireEvent.click(screen.getByTestId('settings-button'));
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

  it('marks the victim token and applies the theme to <html>', async () => {
    store = await setup();
    const victim = store.getState().puzzle!.people.find((p) => p.isVictim)!;
    expect(screen.getByTestId(`card-victim-badge-${victim.id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-button'));
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
