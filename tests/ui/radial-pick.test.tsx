import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { cellKey } from '../../src/engine/types';
import { createGameStore, type GameStore } from '../../src/state/store';
import { HOLD_MS } from '../../src/ui/hold';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.history.pushState({}, '', '/');
});

async function setup(): Promise<StoreApi<GameStore>> {
  window.history.pushState({}, '', '/?seed=ui-test&d=easy');
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return store;
}

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
function freeCell(): [number, number] {
  const el = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')].find(
    (x) => x.dataset.occupant === '',
  )!;
  return [Number(el.dataset.r), Number(el.dataset.c)];
}
/** Note people on a cell and leave nobody selected. */
function note(store: StoreApi<GameStore>, r: number, c: number, ...ids: number[]) {
  act(() => {
    for (const id of ids) store.getState().applyCandidate([cellKey(r, c)], id);
    store.getState().selectPerson(null);
  });
}
function hold(r: number, c: number) {
  fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
  act(() => vi.advanceTimersByTime(HOLD_MS + 10));
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(cell(r, c));
}
const menu = () => screen.queryByTestId('radial-pick');

describe('radial pick', () => {
  it('hold with one noted person places them directly', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1);
    hold(r, c);
    expect(store.getState().placements[1]).toBe(cellKey(r, c));
    expect(store.getState().selectedPerson).toBeNull();
    expect(menu()).toBeNull();
  });

  it('hold without notes does not arm and places nothing', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
    expect(cell(r, c)).not.toHaveAttribute('data-holding');
    act(() => vi.advanceTimersByTime(HOLD_MS + 10));
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(Object.values(store.getState().placements).every((k) => k === null)).toBe(true);
    expect(menu()).toBeNull();
  });

  it('hold with two noted opens the menu; picking places and closes', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1, 2);
    fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
    expect(cell(r, c)).toHaveAttribute('data-holding', 'true');
    act(() => vi.advanceTimersByTime(HOLD_MS + 10));
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(cell(r, c));
    expect(menu()).toBeInTheDocument();
    expect(screen.getByTestId('radial-pick-1')).toHaveFocus();
    expect(screen.getByTestId('radial-pick-2')).toBeInTheDocument();
    expect(store.getState().placements[1]).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('radial-pick-2'), { button: 0 });
    fireEvent.click(screen.getByTestId('radial-pick-2'), { detail: 1 });
    expect(store.getState().placements[2]).toBe(cellKey(r, c));
    expect(menu()).toBeNull();
    act(() => void store.getState().undo());
    expect(store.getState().placements[2]).toBeNull();
  });

  it('Cancel sits at the ring centre and the target cell is marked while open', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1, 2);
    expect(cell(r, c)).not.toHaveAttribute('data-picking');
    hold(r, c);
    const cancel = screen.getByTestId('radial-pick-cancel');
    expect(cancel.style.left).toBe('0px');
    expect(cancel.style.top).toBe('0px');
    expect(cell(r, c)).toHaveAttribute('data-picking', 'true');
    fireEvent.click(cancel);
    expect(menu()).toBeNull();
    expect(cell(r, c)).not.toHaveAttribute('data-picking');
  });

  it('a click without a fresh press on the menu (the opening release) does not pick', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1, 2);
    hold(r, c);
    fireEvent.click(screen.getByTestId('radial-pick-1'), { detail: 1 });
    expect(store.getState().placements[1]).toBeNull();
    expect(menu()).toBeInTheDocument();
  });

  it('Escape and Cancel close it without placing', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1, 2);
    hold(r, c);
    fireEvent.keyDown(screen.getByTestId('radial-pick-1'), { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(cell(r, c)).toHaveFocus();
    hold(r, c);
    fireEvent.click(screen.getByTestId('radial-pick-cancel'));
    expect(menu()).toBeNull();
    expect(Object.values(store.getState().placements).every((k) => k === null)).toBe(true);
  });

  it('an already placed candidate is skipped', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1, 2);
    const other = document.querySelectorAll<HTMLElement>(
      '[data-blocked="false"][data-occupant=""]',
    );
    const el = [...other].find((x) => Number(x.dataset.r) !== r && Number(x.dataset.c) !== c)!;
    act(() => void store.getState().place(1, cellKey(Number(el.dataset.r), Number(el.dataset.c))));
    hold(r, c);
    expect(store.getState().placements[2]).toBe(cellKey(r, c));
    expect(menu()).toBeNull();
  });

  it('Enter does the same from the keyboard; arrows move focus', async () => {
    const store = await setup();
    const [r, c] = freeCell();
    note(store, r, c, 1);
    act(() => cell(r, c).focus());
    fireEvent.keyDown(cell(r, c), { key: 'Enter' });
    expect(store.getState().placements[1]).toBe(cellKey(r, c));

    const [r2, c2] = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')]
      .filter((x) => x.dataset.occupant === '' && Number(x.dataset.r) !== r)
      .map((x) => [Number(x.dataset.r), Number(x.dataset.c)] as [number, number])[0]!;
    note(store, r2, c2, 2, 3);
    act(() => cell(r2, c2).focus());
    fireEvent.keyDown(cell(r2, c2), { key: 'Enter' });
    expect(screen.getByTestId('radial-pick-2')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('radial-pick-2'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('radial-pick-3')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('radial-pick-3'), { key: 'Enter' });
    fireEvent.click(screen.getByTestId('radial-pick-3'));
    expect(store.getState().placements[3]).toBe(cellKey(r2, c2));
    expect(menu()).toBeNull();
  });
});
