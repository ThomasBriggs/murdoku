import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { createGameStore, type GameStore } from '../../src/state/store';
import { abbreviateRoom } from '../../src/ui/LogicGrid';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import { clickMore } from './more';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

async function setup(): Promise<StoreApi<GameStore>> {
  window.history.pushState({}, '', '/?seed=cy-adv&d=easy');
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  return store;
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key: k, ...init });

describe('logic grid', () => {
  it('opens with G, has table semantics, labelled buttons and cycles cells', async () => {
    const store = await setup();
    expect(screen.queryByTestId('logic-grid')).toBeNull();
    key('g');
    expect(screen.getByTestId('logic-grid')).toBeInTheDocument();
    for (const t of ['rooms', 'rows', 'cols'])
      expect(screen.getByTestId(`logic-table-${t}`).tagName).toBe('TABLE');
    const cell = screen.getByTestId('logic-rooms-0-0');
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('blank'));
    fireEvent.click(cell);
    expect(cell).toHaveAttribute('data-state', '1');
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('crossed out'));
    fireEvent.click(cell);
    expect(cell).toHaveAttribute('data-state', '2');
    expect(store.getState().annotations.logicGrid.rooms[0]![0]).toBe(2);
    fireEvent.click(cell);
    expect(cell).toHaveAttribute('data-state', '0');
    // headers use the board's labels
    expect(screen.getByTestId('logic-table-cols').querySelectorAll('thead th')).toHaveLength(9);
    expect(screen.getByTestId('logic-table-cols').textContent).toContain('I');
    fireEvent.click(screen.getByTestId('logic-close'));
    expect(screen.queryByTestId('logic-grid')).toBeNull();
  });

  it('abbreviates long room names', () => {
    expect(abbreviateRoom('Kitchen')).toBe('Kit.');
    expect(abbreviateRoom('Hall')).toBe('Hall');
  });

  it('shades the selected person’s possible cells only when the link setting is on', async () => {
    const store = await setup();
    store.getState().cycleLogicCell('rooms', 0, 0);
    store.getState().cycleLogicCell('rooms', 0, 0); // tick room 0 for panel slot 0
    const victim = store.getState().puzzle!.people.find((p) => p.isVictim)!;
    act(() => store.getState().selectPerson(victim.id));
    expect(document.querySelectorAll('[data-possible="true"]')).toHaveLength(0);
    act(() => store.getState().updateSettings({ linkLogicGrid: true }));
    const shaded = document.querySelectorAll('[data-possible="true"]');
    expect(shaded.length).toBeGreaterThan(0);
    for (const el of shaded) expect((el as HTMLElement).dataset.room).toBe('0');
    act(() => store.getState().selectPerson(null));
    expect(document.querySelectorAll('[data-possible="true"]')).toHaveLength(0);
  });
});

describe('draw tool', () => {
  it('D toggles the tool, Escape leaves it, and the overlay only captures pointers while active', async () => {
    const store = await setup();
    const layer = screen.getByTestId('drawing-layer');
    expect(layer).toHaveAttribute('data-active', 'false');
    key('d');
    expect(store.getState().tool).toBe('draw');
    expect(layer).toHaveAttribute('data-active', 'true');
    key('Escape');
    expect(store.getState().tool).toBe('place');
    expect(layer).toHaveAttribute('data-active', 'false');
    key('d');
    act(() => store.getState().setDrawLocked(true));
    expect(layer).toHaveAttribute('data-active', 'false');
  });

  it('draws a stroke from pointer events and erases it', async () => {
    const store = await setup();
    key('d');
    const layer = screen.getByTestId('drawing-layer');
    layer.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 900, height: 900, right: 900, bottom: 900 }) as DOMRect;
    fireEvent.pointerDown(layer, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 500, clientY: 500, pointerId: 1 });
    expect(screen.getByTestId('stroke-live')).toBeInTheDocument();
    fireEvent.pointerUp(layer, { clientX: 500, clientY: 500, pointerId: 1 });
    expect(store.getState().annotations.strokes).toHaveLength(1);
    expect(store.getState().annotations.strokes[0]!.pts[0]).toEqual([1, 1]);
    expect(screen.getByTestId('stroke-0')).toBeInTheDocument();
    act(() => store.getState().setPen('eraser'));
    fireEvent.pointerDown(layer, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(layer, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(store.getState().annotations.strokes).toHaveLength(0);
    store.getState().undo();
    expect(store.getState().annotations.strokes).toHaveLength(1);
  });
});

describe('what-if UI and scratchpad', () => {
  it('W starts a what-if with a banner; the end dialog keeps or abandons with a note', async () => {
    const store = await setup();
    key('w');
    expect(screen.getByTestId('whatif-level')).toHaveTextContent('What-if (level 1)');
    expect(screen.getByTestId('board')).toHaveAttribute('data-whatif', '1');
    key('w', { shiftKey: true });
    expect(screen.getByTestId('whatif-level')).toHaveTextContent('level 2');
    expect(screen.getByTestId('whatif-breadcrumbs').textContent).toContain('What-if 2');
    fireEvent.click(screen.getByTestId('whatif-abandon'));
    fireEvent.change(screen.getByTestId('whatif-note'), { target: { value: 'C in Kitchen' } });
    fireEvent.click(screen.getByTestId('whatif-abandon-confirm'));
    expect(store.getState().whatIfStack).toHaveLength(1);
    expect(store.getState().annotations.scratchpad).toContain('C in Kitchen → abandoned');
    fireEvent.click(screen.getByTestId('whatif-keep'));
    fireEvent.click(screen.getByTestId('whatif-keep-confirm'));
    expect(screen.queryByTestId('whatif-banner')).toBeNull();
  });

  it('commits scratchpad text on blur as one undo step', async () => {
    const store = await setup();
    fireEvent.click(screen.getByTestId('scratchpad-toggle'));
    const ta = screen.getByTestId('scratchpad-text');
    for (const t of ['I', 'If', 'If C']) fireEvent.change(ta, { target: { value: t } });
    expect(store.getState().history.past).toHaveLength(0);
    fireEvent.blur(ta);
    expect(store.getState().annotations.scratchpad).toBe('If C');
    expect(store.getState().history.past).toHaveLength(1);
    store.getState().undo();
    await waitFor(() => expect(screen.getByTestId('scratchpad-text')).toHaveValue(''));
  });
});

describe('clue-allows dimming and print', () => {
  it('dims ruled-out cells for the selected person and counts one assist', async () => {
    const store = await setup();
    act(() => store.getState().updateSettings({ showClueAllows: true }));
    act(() => store.getState().selectPerson(0));
    expect(document.querySelectorAll('[data-dim="true"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-dim="true"]').length).toBeLessThan(81);
    expect(store.getState().assistsUsed).toBe(1);
    act(() => store.getState().selectPerson(null));
    expect(document.querySelectorAll('[data-dim="true"]')).toHaveLength(0);
  });

  it('prints blank or with marks', async () => {
    const store = await setup();
    const free = document.querySelector<HTMLElement>('[data-blocked="false"]')!;
    act(() => {
      store.getState().applyMark([Number(free.dataset.r) * 9 + Number(free.dataset.c)], 'cross');
    });
    expect(screen.getByTestId('print-sheet')).toHaveAttribute('data-marks', 'false');
    expect(document.querySelectorAll('.ps-mark')).toHaveLength(0);
    const victim = store.getState().puzzle!.people.find((p) => p.isVictim)!;
    expect(screen.getByTestId('print-sheet')).toHaveTextContent(
      `${victim.name} (the victim) was alone in the room with the murderer.`,
    );
    clickMore('print-button');
    fireEvent.click(screen.getByTestId('print-include-marks'));
    expect(screen.getByTestId('print-sheet')).toHaveAttribute('data-marks', 'true');
    expect(document.querySelectorAll('.ps-mark')).toHaveLength(1);
  });
});
