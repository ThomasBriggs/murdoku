import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import App from '../../src/App';
import { cellKey } from '../../src/engine/types';
import { createGameStore, type GameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
  localStorage.clear();
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

const dockTools = () =>
  within(screen.getByTestId('dock'))
    .getAllByRole('button')
    .map((b) => b.dataset.testid)
    .filter((id) => id?.startsWith('tool-'));
const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);

describe('quick bar and tray', () => {
  it('shows only Place, Erase and Cross by default; the other tools are in the tray', async () => {
    const store = await setup();
    expect(dockTools()).toEqual(['tool-place', 'tool-erase', 'tool-cross']);
    for (const id of ['undo', 'redo', 'clues-toggle', 'overflow-button'])
      expect(within(screen.getByTestId('dock')).getByTestId(id)).toBeInTheDocument();
    expect(screen.queryByTestId('tool-dot')).toBeNull();

    fireEvent.click(screen.getByTestId('overflow-button'));
    const tray = screen.getByTestId('tool-palette-tray');
    for (const id of ['pencil', 'dot', 'unsure', 'eliminate', 'highlight', 'select', 'draw'])
      expect(within(tray).getByTestId(`tool-${id}`)).toBeInTheDocument();
    expect(within(tray).queryByTestId('tool-cross')).toBeNull();
    // Tray tools do not advertise a key, since it would not work.
    expect(within(tray).getByTestId('tool-dot')).not.toHaveAttribute('aria-keyshortcuts');
    expect(within(tray).getByTestId('tool-dot').title).toMatch(/Pin it to the quick bar/);
    // Picking a tray tool selects it and closes the tray.
    fireEvent.click(within(tray).getByTestId('tool-dot'));
    expect(store.getState().tool).toBe('dot');
    expect(screen.queryByTestId('overflow-menu')).toBeNull();
  });

  it('only honours the keys of pinned items', async () => {
    const store = await setup();
    act(() => cell(0, 0).focus());
    const press = (key: string) => fireEvent.keyDown(cell(0, 0), { key });
    press('.'); // Dot is in the tray: nothing happens
    press('p');
    press('g');
    press('w');
    expect(store.getState().tool).toBe('place');
    expect(store.getState().annotations.cellMarks).toEqual({});
    expect(screen.queryByTestId('logic-grid')).toBeNull();
    expect(store.getState().whatIfStack).toHaveLength(0);
    press('x'); // Cross is pinned
    expect(cell(0, 0)).toHaveAttribute('data-mark', 'cross');
    press('Delete'); // Erase is pinned
    expect(cell(0, 0)).not.toHaveAttribute('data-mark');
    // Unpin Erase: R and Delete stop working.
    act(() => store.getState().updateSettings({ quickBar: ['cross'] }));
    press('x');
    press('Delete');
    press('r');
    expect(store.getState().annotations.cellMarks[cellKey(0, 0)]).toBe('cross');
    expect(store.getState().tool).toBe('cross');
  });

  it('pins items from Settings, including the logic grid and what-if', async () => {
    const store = await setup();
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('quickbar-erase')).toBeChecked();
    expect(screen.getByTestId('quickbar-dot')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('quickbar-dot'));
    fireEvent.click(screen.getByTestId('quickbar-logic'));
    fireEvent.click(screen.getByTestId('quickbar-erase'));
    expect(store.getState().settings.quickBar).toEqual(['cross', 'dot', 'logic']);
    expect(dockTools()).toEqual(['tool-place', 'tool-cross', 'tool-dot']);
    expect(within(screen.getByTestId('dock')).getByTestId('tool-dot')).toHaveAttribute(
      'aria-keyshortcuts',
      '.',
    );
    fireEvent.click(screen.getByTestId('quick-logic'));
    expect(screen.getByTestId('logic-grid')).toBeInTheDocument();
    expect(screen.getByTestId('quick-logic')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: '.' });
    expect(store.getState().tool).toBe('dot');
  });
});
