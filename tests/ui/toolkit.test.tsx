import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { cellKey } from '../../src/engine/types';
import { createGameStore, type GameStore, QUICK_ITEMS } from '../../src/state/store';
import { clueSelection, splitByHighlights } from '../../src/ui/PeoplePanel';
import { HOLD_MS } from '../../src/ui/hold';
import { TOOLS } from '../../src/ui/ToolPalette';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import { clickMore } from './more';

afterEach(() => {
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
  // These suites exercise every tool and key: pin them all to the quick bar.
  act(() => store.getState().updateSettings({ quickBar: [...QUICK_ITEMS] }));
  return store;
}

/** Same as setup, but waits with real timers before fake ones take over. */
async function setupWithTimers(): Promise<StoreApi<GameStore>> {
  vi.useRealTimers();
  const store = await setup();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return store;
}

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
/** A cell nobody stands on yet and that is not blocked by furniture. */
function freeCell(ok: (r: number, c: number) => boolean = () => true): [number, number] {
  const el = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')].find(
    (x) => x.dataset.occupant === '' && ok(Number(x.dataset.r), Number(x.dataset.c)),
  )!;
  return [Number(el.dataset.r), Number(el.dataset.c)];
}
const card = (id: number) => screen.getByTestId(`person-card-${id}`);
const tool = (id: string) => screen.getByTestId(`tool-${id}`);

describe('tool palette', () => {
  it('has a button with a shortcut tooltip for every tool and switches the active tool', async () => {
    const store = await setup();
    expect(store.getState().tool).toBe('place');
    for (const t of TOOLS) {
      const btn = tool(t.id);
      expect(btn.getAttribute('title')).toContain(t.shortcut);
      fireEvent.click(btn);
      expect(store.getState().tool).toBe(t.id);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    }
    expect(tool('place')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('board')).toHaveAttribute('data-tool', 'draw');
  });

  it('picks a highlight colour while the highlight tool is active', async () => {
    const store = await setup();
    fireEvent.click(tool('highlight'));
    fireEvent.click(screen.getByTestId('color-green'));
    expect(store.getState().color).toBe('green');
    expect(store.getState().tool).toBe('highlight');
    expect(screen.getByTestId('color-green')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('cell tools by click', () => {
  it('cross, dot and unsure marks show on the cell and toggle off', async () => {
    const store = await setup();
    for (const [id, mark] of [
      ['cross', 'cross'],
      ['dot', 'dot'],
      ['unsure', 'unsure'],
    ] as const) {
      fireEvent.click(tool(id));
      fireEvent.click(cell(1, 1));
      expect(cell(1, 1)).toHaveAttribute('data-mark', mark);
      expect(screen.getByTestId('mark-1-1')).toBeInTheDocument();
    }
    fireEvent.click(cell(1, 1));
    expect(cell(1, 1)).not.toHaveAttribute('data-mark');
    expect(store.getState().annotations.cellMarks).toEqual({});
  });

  it('right-click crosses a cell', async () => {
    await setup();
    fireEvent.contextMenu(cell(2, 2));
    expect(cell(2, 2)).toHaveAttribute('data-mark', 'cross');
  });

  it('place mode: a quick tap toggles the selected person’s candidate; Eliminate slashes it', async () => {
    const store = await setup();
    const p = store.getState().puzzle!.people.find((x) => !x.isVictim)!;
    const [r, c] = freeCell();
    fireEvent.click(cell(r, c)); // nobody selected: nothing happens
    expect(cell(r, c)).not.toHaveAttribute('data-candidates');
    fireEvent.click(card(p.id));
    fireEvent.click(cell(r, c));
    expect(cell(r, c)).toHaveAttribute('data-candidates', String(p.id));
    expect(screen.getByTestId(`cand-${r}-${c}-${p.id}`)).toHaveAttribute('data-state', 'yes');
    expect(store.getState().placements[p.id]).toBeNull(); // a tap never places
    expect(store.getState().selectedPerson).toBe(p.id); // stays selected for more cells
    fireEvent.click(cell(r, c));
    expect(cell(r, c)).not.toHaveAttribute('data-candidates');
    fireEvent.click(tool('eliminate'));
    fireEvent.click(cell(r, c));
    expect(cell(r, c)).toHaveAttribute('data-eliminated', String(p.id));
    expect(screen.getByTestId(`cand-${r}-${c}-${p.id}`)).toHaveAttribute('data-state', 'no');
  });

  it('place mode: press and hold places; Enter places and Space notes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const store = await setupWithTimers();
      const [r, c] = freeCell();
      fireEvent.click(card(0));
      fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
      expect(cell(r, c)).toHaveAttribute('data-holding', 'true');
      act(() => vi.advanceTimersByTime(HOLD_MS + 10));
      expect(store.getState().placements[0]).toBe(cellKey(r, c));
      fireEvent.pointerUp(window, { pointerId: 1 });
      fireEvent.click(cell(r, c)); // the click ending the hold is swallowed
      expect(cell(r, c)).not.toHaveAttribute('data-candidates');
      expect(cell(r, c)).not.toHaveAttribute('data-holding');
      // A short press is just a tap: it notes, it does not place.
      fireEvent.click(card(1));
      const [r2, c2] = freeCell((rr, cc) => rr !== r && cc !== c);
      fireEvent.pointerDown(cell(r2, c2), { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(HOLD_MS / 3));
      fireEvent.pointerUp(window, { pointerId: 1 });
      act(() => vi.runOnlyPendingTimers());
      fireEvent.click(cell(r2, c2));
      expect(store.getState().placements[1]).toBeNull();
      expect(cell(r2, c2)).toHaveAttribute('data-candidates', '1');
      // Keyboard: Space notes (toggles it off again), Enter places.
      act(() => cell(r2, c2).focus());
      fireEvent.keyDown(cell(r2, c2), { key: ' ' });
      expect(cell(r2, c2)).not.toHaveAttribute('data-candidates');
      fireEvent.keyDown(cell(r2, c2), { key: 'Enter' });
      expect(store.getState().placements[1]).toBe(cellKey(r2, c2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('cross tool: hold clears notes and crosses; a quick tap toggles the cross', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const store = await setupWithTimers();
      const [r, c] = freeCell();
      const key = cellKey(r, c);
      act(() => {
        store.getState().applyCandidate([key], 0);
        store.getState().applyCandidate([key], 1, true);
        store.getState().selectPerson(null);
      });
      fireEvent.click(tool('cross'));
      fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
      expect(cell(r, c)).toHaveAttribute('data-holding', 'true');
      act(() => vi.advanceTimersByTime(HOLD_MS + 10));
      fireEvent.contextMenu(cell(r, c)); // touch long press: must not toggle
      fireEvent.pointerUp(window, { pointerId: 1 });
      fireEvent.click(cell(r, c)); // the click ending the hold is swallowed
      expect(store.getState().annotations.cellMarks[key]).toBe('cross');
      expect(store.getState().annotations.candidates[key]).toBeUndefined();
      expect(cell(r, c)).not.toHaveAttribute('data-candidates');
      // A quick tap still toggles the cross off.
      fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(HOLD_MS / 3));
      fireEvent.pointerUp(window, { pointerId: 1 });
      fireEvent.click(cell(r, c));
      expect(store.getState().annotations.cellMarks[key]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a long touch press does not also cross the cell', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const store = await setupWithTimers();
      const [r, c] = freeCell();
      fireEvent.click(card(0));
      fireEvent.pointerDown(cell(r, c), { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(HOLD_MS + 10));
      fireEvent.contextMenu(cell(r, c));
      fireEvent.pointerUp(window, { pointerId: 1 });
      expect(store.getState().placements[0]).toBe(cellKey(r, c));
      expect(store.getState().annotations.cellMarks).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it('highlight tool fills with the chosen colour (data-hl-color)', async () => {
    await setup();
    fireEvent.click(tool('highlight'));
    fireEvent.click(screen.getByTestId('color-blue'));
    fireEvent.click(cell(3, 3));
    expect(cell(3, 3)).toHaveAttribute('data-hl-color', 'blue');
  });

  it('pencil mode places a dashed tentative token that promotes with one click', async () => {
    const store = await setup();
    const free = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')][0]!;
    const [r, c] = [Number(free.dataset.r), Number(free.dataset.c)];
    fireEvent.click(card(0));
    fireEvent.click(tool('pencil'));
    fireEvent.click(cell(r, c));
    expect(screen.getByTestId('tentative-0')).toBeInTheDocument();
    expect(cell(r, c)).toHaveAttribute('data-tentative', '0');
    expect(cell(r, c)).toHaveAttribute('data-occupant', '');
    expect(store.getState().placements[0]).toBeNull();
    expect(screen.getByTestId('person-status-0')).toHaveTextContent('Guess');
    fireEvent.click(screen.getByTestId('promote-0'));
    expect(store.getState().placements[0]).toBe(cellKey(r, c));
    expect(screen.queryByTestId('tentative-0')).toBeNull();
    expect(cell(r, c)).toHaveAttribute('data-occupant', '0');
  });

  it('speaks a cell’s marks, candidates and guesses in its label; initials are CSS-only', async () => {
    const store = await setup();
    const people = store.getState().puzzle!.people;
    const [r, c] = freeCell();
    expect(cell(r, c).getAttribute('aria-label')).toMatch(/, empty$/);
    for (const id of [0, 1]) {
      fireEvent.click(card(id));
      fireEvent.click(cell(r, c));
    }
    fireEvent.click(card(2));
    fireEvent.click(tool('eliminate'));
    fireEvent.click(cell(r, c));
    fireEvent.click(card(3));
    fireEvent.click(tool('pencil'));
    fireEvent.click(cell(r, c));
    fireEvent.click(tool('unsure'));
    fireEvent.click(cell(r, c));
    const name = (id: number) => people.find((x) => x.id === id)!.name;
    const label = cell(r, c).getAttribute('aria-label')!;
    expect(label).toContain(', empty, unsure, ');
    expect(label).toContain(`might be ${name(0)} and ${name(1)}`);
    expect(label).toContain(`not ${name(2)}`);
    expect(label).toContain(`pencilled in ${name(3)}`);
    // the letters are drawn by CSS (data-glyph), so no bare text nodes sit in the cell
    expect(screen.getByTestId(`cand-${r}-${c}-0`)).toHaveAttribute(
      'data-glyph',
      people.find((x) => x.id === 0)!.initial,
    );
    expect(screen.getByTestId(`cands-${r}-${c}`)).toHaveTextContent('');
    expect(screen.getByTestId(`tentative-3`)).toHaveTextContent('');
  });

  it('erase tool wipes a cell; tentative and placed tokens have a ✕ to remove them', async () => {
    const store = await setup();
    const free = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')];
    const at = (i: number) => [Number(free[i]!.dataset.r), Number(free[i]!.dataset.c)] as const;
    const [r, c] = at(0);
    fireEvent.click(tool('cross'));
    fireEvent.click(cell(r, c));
    fireEvent.click(tool('highlight'));
    fireEvent.click(cell(r, c));
    fireEvent.click(tool('erase'));
    fireEvent.click(cell(r, c));
    expect(cell(r, c)).not.toHaveAttribute('data-mark');
    expect(cell(r, c)).not.toHaveAttribute('data-hl-color');

    fireEvent.click(card(0));
    fireEvent.click(tool('pencil'));
    fireEvent.click(cell(r, c));
    fireEvent.click(screen.getByTestId('untentative-0'));
    expect(store.getState().tentativePlacements[0]).toBeNull();
    expect(screen.queryByTestId('tentative-0')).toBeNull();

    fireEvent.click(card(1));
    fireEvent.click(tool('place'));
    fireEvent.keyDown(cell(r, c), { key: 'Enter' });
    expect(cell(r, c)).toHaveAttribute('data-occupant', '1');
    fireEvent.click(screen.getByTestId('unplace-1'));
    expect(store.getState().placements[1]).toBeNull();
    expect(cell(r, c)).toHaveAttribute('data-occupant', '');
    expect(screen.queryByTestId('unplace-1')).toBeNull();
  });
});

describe('keyboard shortcuts', () => {
  it('X . ? mark the cursor cell when the board has focus', async () => {
    await setup();
    const grid = screen.getByRole('grid');
    act(() => cell(0, 0).focus());
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(cell(0, 1), { key: 'x' });
    expect(cell(0, 1)).toHaveAttribute('data-mark', 'cross');
    fireEvent.keyDown(cell(0, 1), { key: '.' });
    expect(cell(0, 1)).toHaveAttribute('data-mark', 'dot');
    fireEvent.keyDown(cell(0, 1), { key: '?' });
    expect(cell(0, 1)).toHaveAttribute('data-mark', 'unsure');
    fireEvent.keyDown(cell(0, 1), { key: 'Backspace' });
    expect(cell(0, 1)).not.toHaveAttribute('data-mark');
  });

  it('a clicked cell is not marked by X until the keyboard cursor is shown; Esc hides it', async () => {
    const store = await setup();
    const grid = screen.getByRole('grid');
    fireEvent.pointerDown(cell(0, 0), { button: 0 });
    act(() => cell(0, 0).focus());
    fireEvent.pointerUp(window);
    expect(grid).not.toHaveAttribute('data-kbd');
    fireEvent.keyDown(cell(0, 0), { key: 'x' });
    expect(store.getState().tool).toBe('cross');
    expect(cell(0, 0)).not.toHaveAttribute('data-mark');
    fireEvent.keyDown(cell(0, 0), { key: 'ArrowRight' });
    expect(grid).toHaveAttribute('data-kbd', 'true');
    fireEvent.keyDown(cell(0, 1), { key: 'x' });
    expect(cell(0, 1)).toHaveAttribute('data-mark', 'cross');
    fireEvent.keyDown(cell(0, 1), { key: 'Escape' });
    expect(grid).not.toHaveAttribute('data-kbd');
  });

  it('P, E, S, V switch tools and C cycles the highlight colour', async () => {
    const store = await setup();
    const press = (key: string) => fireEvent.keyDown(window, { key });
    press('n'); // the old Notes key does nothing now
    expect(store.getState().tool).toBe('place');
    press('p');
    expect(store.getState().tool).toBe('pencil');
    press('e');
    expect(store.getState().tool).toBe('eliminate');
    press('s');
    expect(store.getState().tool).toBe('select');
    press('r');
    expect(store.getState().tool).toBe('erase');
    press('v');
    expect(store.getState().tool).toBe('place');
    press('c');
    expect(store.getState().tool).toBe('highlight');
    expect(store.getState().color).toBe('amber');
    press('c');
    expect(store.getState().color).toBe('red');
    press('x'); // no selection and board not focused: only switches tool
    expect(store.getState().tool).toBe('cross');
    expect(store.getState().annotations.cellMarks).toEqual({});
  });

  it('ignores shortcuts while typing in a note field', async () => {
    const store = await setup();
    const person = store.getState().puzzle!.people[1]!.id;
    fireEvent.click(screen.getByTestId(`person-note-btn-${person}`));
    fireEvent.keyDown(screen.getByTestId(`person-note-${person}`), { key: 'x' });
    expect(store.getState().tool).toBe('place');
    fireEvent.click(screen.getByTestId('scratchpad-toggle'));
    fireEvent.keyDown(screen.getByTestId('scratchpad-text'), { key: 'x' });
    expect(store.getState().tool).toBe('place');
  });

  it('number keys in Eliminate mode slash that person’s initial at the cursor', async () => {
    const store = await setup();
    const grid = screen.getByRole('grid');
    const order = store
      .getState()
      .puzzle!.people.slice()
      .sort((a, b) => Number(b.isVictim) - Number(a.isVictim) || a.id - b.id);
    fireEvent.keyDown(window, { key: 'e' });
    act(() => cell(2, 2).focus());
    fireEvent.keyDown(grid, { key: '3', code: 'Digit3' });
    expect(cell(2, 2)).toHaveAttribute('data-eliminated', String(order[2]!.id));
    expect(store.getState().selectedPerson).toBeNull(); // digits did not select a person
  });

  it('marks and candidates apply to the whole multi-selection', async () => {
    const store = await setup();
    store.getState().selectCells([cellKey(0, 0), cellKey(0, 1), cellKey(5, 5)]);
    fireEvent.keyDown(window, { key: 'x' });
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [5, 5],
    ] as const)
      expect(cell(r, c)).toHaveAttribute('data-mark', 'cross');
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: '1', code: 'Digit1' }); // pick a person
    fireEvent.keyDown(screen.getByRole('grid'), { key: ' ' }); // Space notes them on all
    expect(cell(5, 5)).toHaveAttribute('data-candidates');
    expect(cell(0, 1)).toHaveAttribute('data-candidates');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().selection).toEqual([]);
  });
});

describe('V key on the selection', () => {
  it('notes the picked person on every selected cell, placing nobody', async () => {
    const store = await setupWithTimers();
    const free = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')]
      .slice(0, 3)
      .map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as const);
    act(() => {
      store.getState().selectCells(free.map(([r, c]) => cellKey(r, c)));
      store.getState().selectPerson(1);
    });
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyUp(window, { key: 'v' });
    act(() => void vi.advanceTimersByTime(HOLD_MS + 50));
    for (const [r, c] of free) expect(cell(r, c)).toHaveAttribute('data-candidates', '1');
    expect(store.getState().placements[1]).toBeNull();
    vi.useRealTimers();
  });

  it('a quick V on the cursor cell notes; holding V places', async () => {
    const store = await setupWithTimers();
    const [r, c] = freeCell((_, cc) => cc > 0);
    act(() => store.getState().selectPerson(1));
    fireEvent.keyDown(cell(r, c - 1), { key: 'ArrowRight' }); // shows the cursor on (r, c)
    fireEvent.keyDown(cell(r, c), { key: 'v' });
    fireEvent.keyUp(cell(r, c), { key: 'v' });
    expect(cell(r, c)).toHaveAttribute('data-candidates', '1');
    expect(store.getState().placements[1]).toBeNull();
    fireEvent.keyDown(cell(r, c), { key: 'v' });
    act(() => void vi.advanceTimersByTime(HOLD_MS + 50));
    fireEvent.keyUp(cell(r, c), { key: 'v' });
    expect(store.getState().placements[1]).toBe(cellKey(r, c));
    vi.useRealTimers();
  });

  it('with nobody picked, holding V places the one noted person; no notes arms nothing', async () => {
    const store = await setupWithTimers();
    const [r, c] = freeCell((_, cc) => cc > 0);
    fireEvent.keyDown(cell(r, c - 1), { key: 'ArrowRight' }); // shows the cursor on (r, c)
    fireEvent.keyDown(cell(r, c), { key: 'v' });
    expect(cell(r, c)).not.toHaveAttribute('data-holding');
    fireEvent.keyUp(cell(r, c), { key: 'v' });
    act(() => store.getState().applyCandidate([cellKey(r, c)], 1));
    fireEvent.keyDown(cell(r, c), { key: 'v' });
    expect(cell(r, c)).toHaveAttribute('data-holding', 'true');
    act(() => void vi.advanceTimersByTime(HOLD_MS + 50));
    expect(store.getState().placements[1]).toBe(cellKey(r, c));
    vi.useRealTimers();
  });

  it('with no target V only switches to Place', async () => {
    const store = await setupWithTimers();
    store.getState().selectPerson(1);
    store.getState().setTool('cross');
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyUp(window, { key: 'v' });
    act(() => void vi.advanceTimersByTime(HOLD_MS + 50));
    expect(store.getState().tool).toBe('place');
    expect(store.getState().annotations.candidates).toEqual({});
    expect(store.getState().placements[1]).toBeNull();
    vi.useRealTimers();
  });
});

describe('picking a person in the clues', () => {
  it('switches any other tool to Place, and deselecting leaves the tool alone', async () => {
    const store = await setup();
    store.getState().setTool('cross');
    fireEvent.click(within(card(1)).getAllByRole('button')[0]!);
    expect(store.getState().selectedPerson).toBe(1);
    expect(store.getState().tool).toBe('place');
    store.getState().setTool('cross');
    fireEvent.click(within(card(1)).getAllByRole('button')[0]!);
    expect(store.getState().selectedPerson).toBeNull();
    expect(store.getState().tool).toBe('cross');
  });
});

describe('multi-select', () => {
  it('drag selects the visited cells; the Cross button applies to all of them', async () => {
    const store = await setup();
    fireEvent.pointerDown(cell(0, 0), { button: 0 });
    fireEvent.pointerMove(cell(0, 1));
    fireEvent.pointerMove(cell(1, 1));
    fireEvent.pointerUp(window);
    expect(store.getState().selection).toEqual([cellKey(0, 0), cellKey(0, 1), cellKey(1, 1)]);
    expect(cell(1, 1)).toHaveAttribute('data-sel', 'true');
    fireEvent.click(tool('cross'));
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [1, 1],
    ] as const)
      expect(cell(r, c)).toHaveAttribute('data-mark', 'cross');
    expect(store.getState().history.past).toHaveLength(1); // one undo step for the group
    fireEvent.click(screen.getByTestId('undo'));
    expect(cell(0, 1)).not.toHaveAttribute('data-mark');
  });

  it('a drag does not also click the cell it ends on', async () => {
    const store = await setup();
    fireEvent.click(tool('cross'));
    fireEvent.pointerDown(cell(0, 0), { button: 0 });
    fireEvent.pointerMove(cell(0, 1));
    fireEvent.pointerUp(window);
    fireEvent.click(cell(0, 1)); // browsers fire this after the drag
    expect(store.getState().annotations.cellMarks).toEqual({});
  });

  it('Shift-click adds cells to the selection', async () => {
    const store = await setup();
    fireEvent.click(tool('cross'));
    fireEvent.click(cell(0, 0), { shiftKey: true });
    fireEvent.click(cell(2, 2), { shiftKey: true });
    expect(store.getState().selection).toEqual([cellKey(0, 0), cellKey(2, 2)]);
    expect(store.getState().annotations.cellMarks).toEqual({}); // selecting did not mark
    fireEvent.click(cell(0, 0), { shiftKey: true });
    expect(store.getState().selection).toEqual([cellKey(2, 2)]);
  });

  it('clicking a row number or column letter selects the whole line; Shift adds', async () => {
    const store = await setup();
    fireEvent.click(screen.getByTestId('row-label-3'));
    expect(store.getState().selection).toHaveLength(9);
    expect(cell(3, 8)).toHaveAttribute('data-sel', 'true');
    fireEvent.click(screen.getByTestId('col-label-4'), { shiftKey: true });
    expect(store.getState().selection).toHaveLength(17);
    fireEvent.click(screen.getByTestId('col-label-0'));
    expect(store.getState().selection).toEqual(Array.from({ length: 9 }, (_, r) => cellKey(r, 0)));
  });

  it('double-clicking a room label selects the room; a furniture key entry selects its type', async () => {
    const store = await setup();
    const puzzle = store.getState().puzzle!;
    const room = puzzle.rooms[0]!;
    fireEvent.doubleClick(screen.getByTestId(`room-label-${room.id}`));
    expect(store.getState().selection).toHaveLength(room.cells.length);
    store.getState().clearSelection();

    fireEvent.click(screen.getByTestId('key-toggle'));
    const legend = within(await screen.findByTestId('furniture-legend'));
    const btn = legend.getAllByRole('button')[0]!;
    const type = btn.dataset.testid!.replace('legend-furniture-', '');
    fireEvent.click(btn);
    const count = puzzle.furniture.flat().filter((f) => f === type).length;
    expect(store.getState().selection).toHaveLength(count);
    expect(document.querySelectorAll('[data-sel="true"]')).toHaveLength(count);
  });
});

describe('margin notes', () => {
  it('row and column notes no longer exist', async () => {
    await setup();
    expect(screen.queryByTestId('row-note-0')).toBeNull();
    expect(screen.queryByTestId('col-note-0')).toBeNull();
  });

  it('room notes are gone too: no room legend and no note badge on room labels', async () => {
    const store = await setup();
    const room = store.getState().puzzle!.rooms[0]!;
    expect(screen.queryByTestId('room-legend')).toBeNull();
    expect(screen.queryByTestId(`room-note-btn-${room.id}`)).toBeNull();
    // A note from an old save is ignored.
    act(() => store.getState().setRoomNote(room.id, 'old note'));
    expect(screen.getByTestId(`room-label-${room.id}`)).not.toHaveAttribute('data-note');
    expect(screen.getByTestId(`room-label-${room.id}`)).not.toHaveTextContent('old note');
  });
});

describe('layers, clearing and settings', () => {
  it('hides candidates, marks, highlights and tentative tokens per layer', async () => {
    const store = await setup();
    store.getState().applyMark([cellKey(0, 0)], 'cross');
    store.getState().applyCandidate([cellKey(0, 1)], 0);
    store.getState().applyHighlight([cellKey(0, 2)], 'red');
    const free = document.querySelector<HTMLElement>('[data-blocked="false"]')!;
    const fk = cellKey(Number(free.dataset.r), Number(free.dataset.c));
    store.getState().placeTentative(0, fk);
    clickMore('layers-button');
    for (const [layer, gone] of [
      ['crosses', () => cell(0, 0).getAttribute('data-mark')],
      ['candidates', () => cell(0, 1).getAttribute('data-candidates')],
      ['highlights', () => cell(0, 2).getAttribute('data-hl-color')],
      ['tentative', () => screen.queryByTestId('tentative-0')],
    ] as const) {
      expect(gone(), layer).toBeTruthy();
      fireEvent.click(screen.getByTestId(`layer-${layer}`));
      expect(gone(), layer).toBeFalsy();
      fireEvent.click(screen.getByTestId(`layer-${layer}`));
      expect(gone(), layer).toBeTruthy();
    }
    expect(screen.queryByTestId('layer-margins')).toBeNull(); // room notes are gone
    expect(screen.getByTestId('layer-drawing')).not.toBeDisabled();
    expect(store.getState().history.past).toHaveLength(4); // visibility never enters history
  });

  it('Clear… asks for confirmation and each clear is undoable', async () => {
    const store = await setup();
    store.getState().applyMark([cellKey(0, 0)], 'cross');
    store.getState().applyHighlight([cellKey(0, 2)], 'red');
    clickMore('clear-button');
    fireEvent.click(screen.getByTestId('clear-layer-highlights'));
    fireEvent.click(screen.getByTestId('cancel-reset'));
    expect(store.getState().annotations.highlights).not.toEqual({});
    clickMore('clear-button');
    fireEvent.click(screen.getByTestId('clear-layer-highlights'));
    fireEvent.click(screen.getByTestId('confirm-reset'));
    expect(store.getState().annotations.highlights).toEqual({});
    expect(cell(0, 0)).toHaveAttribute('data-mark', 'cross');
    clickMore('clear-button');
    fireEvent.click(screen.getByTestId('clear-annotations'));
    fireEvent.click(screen.getByTestId('confirm-reset'));
    expect(cell(0, 0)).not.toHaveAttribute('data-mark');
    fireEvent.click(screen.getByTestId('undo'));
    expect(cell(0, 0)).toHaveAttribute('data-mark', 'cross');
  });

  it('exposes the auto-clear-candidates setting', async () => {
    const store = await setup();
    clickMore('settings-button');
    expect(screen.getByTestId('setting-autoclear')).toBeChecked();
    fireEvent.click(screen.getByTestId('setting-autoclear'));
    expect(store.getState().settings.autoClearCandidates).toBe(false);
  });
});

describe('clue annotations', () => {
  it('ticks atoms separately, strikes the clue and keeps a per-person note', async () => {
    const store = await setup();
    const puzzle = store.getState().puzzle!;
    const multi = puzzle.clues.find((c) => c.atoms.length >= 2)!;
    const id = multi.person;
    const tick0 = screen.getByTestId(`clue-tick-${id}-0`);
    fireEvent.click(tick0);
    expect(screen.getByTestId(`clue-atom-${id}-0`)).toHaveAttribute('data-ticked', 'true');
    expect(screen.getByTestId(`clue-atom-${id}-1`)).toHaveAttribute('data-ticked', 'false');
    expect(store.getState().selectedPerson).toBeNull(); // ticking does not select the card
    fireEvent.click(screen.getByTestId(`clue-tick-${id}-1`));
    fireEvent.click(tick0);
    expect(store.getState().annotations.clueTicks[id]).toEqual([false, true]);

    fireEvent.click(screen.getByTestId(`clue-strike-${id}`));
    expect(card(id)).toHaveAttribute('data-struck', 'true');
    expect(store.getState().annotations.clueStruck).toEqual([id]);

    expect(screen.queryByTestId(`person-note-${id}`)).toBeNull(); // hidden until asked for
    fireEvent.click(screen.getByTestId(`person-note-btn-${id}`));
    const note = screen.getByTestId(`person-note-${id}`) as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'row 2 or 7' } });
    fireEvent.blur(note);
    expect(store.getState().annotations.personNotes[id]).toBe('row 2 or 7');
    // a non-empty note shows as text; clicking it edits again
    expect(screen.getByTestId(`person-note-text-${id}`)).toHaveTextContent('row 2 or 7');
    fireEvent.click(screen.getByTestId(`person-note-text-${id}`));
    expect(screen.getByTestId(`person-note-${id}`)).toBeInTheDocument();
  });

  it('splits clue text at highlight ranges', () => {
    expect(splitByHighlights('abcdef', 10, [{ start: 12, end: 14, color: 'red' }])).toEqual([
      { text: 'ab', start: 10, color: undefined },
      { text: 'cd', start: 12, color: 'red' },
      { text: 'ef', start: 14, color: undefined },
    ]);
    expect(splitByHighlights('abc', 0, [])).toEqual([{ text: 'abc', start: 0, color: undefined }]);
  });

  it('colours a selected range of words in a clue', async () => {
    const store = await setup();
    const id = store.getState().puzzle!.clues[0]!.person;
    const clue = screen.getByTestId(`person-clue-${id}`);
    const run = clue.querySelector<HTMLElement>('[data-off]')!;
    const range = document.createRange();
    range.selectNodeContents(run);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(clueSelection(clue)).toEqual({
      start: Number(run.dataset.off),
      end: Number(run.dataset.off) + run.textContent!.length,
    });
    fireEvent.mouseUp(clue);
    fireEvent.click(screen.getByTestId(`clue-hl-${id}-green`));
    expect(store.getState().annotations.clueHighlights[id]).toEqual([
      {
        start: Number(run.dataset.off),
        end: Number(run.dataset.off) + run.textContent!.length,
        color: 'green',
      },
    ]);
    expect(
      screen.getByTestId(`person-clue-${id}`).querySelector('[data-clue-hl="green"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByTestId(`clue-hl-clear-${id}`));
    expect(store.getState().annotations.clueHighlights).toEqual({});
  });
});
