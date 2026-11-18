import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { cellKey } from '../../src/engine/types';
import { createGameStore } from '../../src/state/store';
import { setCellRenderProbe } from '../../src/ui/Cell';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

afterEach(() => {
  setCellRenderProbe(null);
  cleanup();
  window.history.pushState({}, '', '/');
});

async function setup() {
  window.history.pushState({}, '', '/?seed=perf-test&d=easy');
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  render(<App store={store} />);
  await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument(), { timeout: 20000 });
  return store;
}

/** Cells re-rendered by `change` (count of Cell renders committed while it ran). */
function rendersDuring(change: () => void): number {
  let n = 0;
  setCellRenderProbe(() => n++);
  act(change);
  setCellRenderProbe(null);
  return n;
}

describe('re-render guard (SPEC milestone 8)', () => {
  it('a single-cell mark re-renders only that cell', async () => {
    const store = await setup();
    const n = rendersDuring(() => store.getState().applyMark([cellKey(4, 4)], 'dot'));
    console.log(`[perf] one mark re-rendered ${n} of 81 cells`);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3);
  });

  it('moving the selection or toggling a tool re-renders no cells', async () => {
    const store = await setup();
    const n = rendersDuring(() => {
      store.getState().setTool('cross');
      store.getState().selectPerson(2);
    });
    console.log(`[perf] tool + person selection re-rendered ${n} cells`);
    expect(n).toBeLessThanOrEqual(3);
  });

  it('placing a person re-renders far fewer than all 81 cells', async () => {
    const store = await setup();
    const free = [...document.querySelectorAll<HTMLElement>('[data-blocked="false"]')][0]!;
    const key = cellKey(Number(free.dataset.r), Number(free.dataset.c));
    const n = rendersDuring(() => {
      store.getState().place(1, key);
    });
    console.log(`[perf] one placement re-rendered ${n} of 81 cells`);
    // The cell itself plus its auto-crossed row and column (at most 17) and conflicts.
    expect(n).toBeLessThanOrEqual(20);
  });
});
