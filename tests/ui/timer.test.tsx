import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../../src/state/store';
import { formatTime } from '../../src/ui/time';
import { useGameTimer } from '../../src/ui/useGameTimer';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

async function playing() {
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  await store.getState().newGame('timer-test', 'easy');
  return store;
}

describe('formatTime', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65_000)).toBe('01:05');
    expect(formatTime(59_999)).toBe('00:59');
    expect(formatTime(3_599_000)).toBe('59:59');
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(3_725_000)).toBe('1:02:05');
    expect(formatTime(-5)).toBe('00:00');
  });
});

describe('game timer', () => {
  it('counts while playing', async () => {
    const store = await playing();
    vi.useFakeTimers();
    renderHook(() => useGameTimer(store));
    vi.advanceTimersByTime(5000);
    expect(store.getState().elapsedMs).toBeGreaterThanOrEqual(4750);
    expect(store.getState().elapsedMs).toBeLessThanOrEqual(5000);
  });

  it('pauses while the tab is hidden and resumes when visible', async () => {
    const store = await playing();
    vi.useFakeTimers();
    renderHook(() => useGameTimer(store));
    vi.advanceTimersByTime(2000);
    setHidden(true);
    const atHide = store.getState().elapsedMs;
    expect(atHide).toBeGreaterThanOrEqual(1750);
    vi.advanceTimersByTime(60_000);
    expect(store.getState().elapsedMs).toBe(atHide);
    setHidden(false);
    vi.advanceTimersByTime(3000);
    const after = store.getState().elapsedMs;
    expect(after - atHide).toBeGreaterThanOrEqual(2750);
    expect(after - atHide).toBeLessThanOrEqual(3000);
  });

  it('stops when the game is won, and does not run before it starts', async () => {
    const store = await playing();
    vi.useFakeTimers();
    renderHook(() => useGameTimer(store));
    vi.advanceTimersByTime(1000);
    store.setState({ status: 'won', running: false });
    const atWin = store.getState().elapsedMs;
    vi.advanceTimersByTime(30_000);
    expect(store.getState().elapsedMs).toBe(atWin);
    // a fresh game generating: nothing accrues
    const idle = createGameStore({
      client: createEngineClient({ workerFactory: createInProcessWorker }),
    });
    renderHook(() => useGameTimer(idle));
    vi.advanceTimersByTime(10_000);
    expect(idle.getState().elapsedMs).toBe(0);
  });
});
