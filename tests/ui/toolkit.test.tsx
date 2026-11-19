import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { cellKey } from '../../src/engine/types';
import { createGameStore, type GameStore } from '../../src/state/store';
import { clueSelection, splitByHighlights } from '../../src/ui/PeoplePanel';
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
  return store;
}

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
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

  it('notes mode: click toggles the selected person’s candidate, Shift eliminates', async () => {
    const store = await setup();
    const p = store.getState().puzzle!.people.find((x) => !x.isVictim)!;
    fireEvent.click(tool('notes'));
    fireEvent.click(cell(0, 0)); // nobody selected: nothing happens
    expect(cell(0, 0)).not.toHaveAttribute('data-candidates');
    fireEvent.click(card(p.id));
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0)).toHaveAttribute('data-candidates', String(p.id));
    expect(screen.getByTestId(`cand-0-0-${p.id}`)).toHaveAttribute('data-state', 'yes');
    expect(store.getState().selectedPerson).toBe(p.id); // stays selected for more cells
    fireEvent.click(cell(0, 0), { shiftKey: true });
    expect(cell(0, 0)).toHaveAttribute('data-eliminated', String(p.id));
    expect(cell(0, 0)).not.toHaveAttribute('data-candidates');
    expect(screen.getByTestId(`cand-0-0-${p.id}`)).toHaveAttribute('data-state', 'no');
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
    fireEvent.click(tool('pencil'));
    fireEvent.click(card(0));
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

    fireEvent.click(tool('pencil'));
    fireEvent.click(card(0));
    fireEvent.click(cell(r, c));
    fireEvent.click(screen.getByTestId('untentative-0'));
    expect(store.getState().tentativePlacements[0]).toBeNull();
    expect(screen.queryByTestId('tentative-0')).toBeNull();

    fireEvent.click(tool('place'));
    fireEvent.click(card(1));
    fireEvent.click(cell(r, c));
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

  it('N, P, E, S, V switch tools and C cycles the highlight colour', async () => {
    const store = await setup();
    const press = (key: string) => fireEvent.keyDown(window, { key });
    press('n');
    expect(store.getState().tool).toBe('notes');
    press('n');
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
    const input = screen.getByTestId('row-note-0');
    fireEvent.keyDown(input, { key: 'n' });
    expect(store.getState().tool).toBe('place');
  });

  it('number keys in notes mode toggle that person’s candidate at the cursor; Shift eliminates', async () => {
    const store = await setup();
    const grid = screen.getByRole('grid');
    const order = store
      .getState()
      .puzzle!.people.slice()
      .sort((a, b) => Number(b.isVictim) - Number(a.isVictim) || a.id - b.id);
    fireEvent.keyDown(window, { key: 'n' });
    act(() => cell(2, 2).focus());
    fireEvent.keyDown(grid, { key: '3', code: 'Digit3' });
    expect(cell(2, 2)).toHaveAttribute('data-candidates', String(order[2]!.id));
    fireEvent.keyDown(grid, { key: '#', code: 'Digit3', shiftKey: true });
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
    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: '1', code: 'Digit1' });
    expect(cell(5, 5)).toHaveAttribute('data-candidates');
    expect(cell(0, 1)).toHaveAttribute('data-candidates');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().selection).toEqual([]);
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

  it('double-clicking a room label or legend entry selects the room; a furniture entry selects its type', async () => {
    const store = await setup();
    const puzzle = store.getState().puzzle!;
    const room = puzzle.rooms[0]!;
    fireEvent.doubleClick(screen.getByTestId(`room-label-${room.id}`));
    expect(store.getState().selection).toHaveLength(room.cells.length);
    store.getState().clearSelection();
    const other = puzzle.rooms[1]!;
    fireEvent.doubleClick(screen.getByTestId(`legend-room-${other.id}`));
    expect(store.getState().selection).toHaveLength(other.cells.length);

    const legend = within(screen.getByTestId('furniture-legend'));
    const btn = legend.getAllByRole('button')[0]!;
    const type = btn.dataset.testid!.replace('legend-furniture-', '');
    fireEvent.click(btn);
    const count = puzzle.furniture.flat().filter((f) => f === type).length;
    expect(store.getState().selection).toHaveLength(count);
    expect(document.querySelectorAll('[data-sel="true"]')).toHaveLength(count);
  });
});

describe('margin notes', () => {
  it('row, column and room notes are edited in place and survive undo/redo', async () => {
    const store = await setup();
    const row = screen.getByTestId('row-note-3') as HTMLInputElement;
    fireEvent.change(row, { target: { value: 'B/D' } });
    fireEvent.blur(row);
    expect(store.getState().annotations.rowNotes[3]).toBe('B/D');
    expect((screen.getByTestId('row-note-3') as HTMLInputElement).value).toBe('B/D');
    const col = screen.getByTestId('col-note-2') as HTMLInputElement;
    fireEvent.change(col, { target: { value: 'C' } });
    fireEvent.keyDown(col, { key: 'Enter' });
    fireEvent.blur(col);
    expect(store.getState().annotations.colNotes[2]).toBe('C');

    const room = store.getState().puzzle!.rooms[0]!;
    fireEvent.click(screen.getByTestId(`room-note-btn-${room.id}`));
    const input = screen.getByTestId(`room-note-input-${room.id}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'only C or F' } });
    fireEvent.blur(input);
    expect(screen.getByTestId(`room-note-${room.id}`)).toHaveTextContent('only C or F');
    expect(screen.getByTestId(`room-label-${room.id}`)).toHaveAttribute('data-note', 'true');

    fireEvent.click(screen.getByTestId('undo'));
    expect(store.getState().annotations.roomNotes).toEqual({});
    expect(screen.queryByTestId(`room-note-${room.id}`)).toBeNull();
    fireEvent.click(screen.getByTestId('redo'));
    expect(store.getState().annotations.roomNotes[room.id]).toBe('only C or F');
  });
});

describe('layers, clearing and settings', () => {
  it('hides candidates, marks, highlights, margins and tentative tokens per layer', async () => {
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
    fireEvent.click(screen.getByTestId('layer-margins'));
    expect(screen.queryByTestId('row-note-0')).toBeNull();
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
