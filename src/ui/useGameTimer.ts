import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { GameStore } from '../state/store';

export const TIMER_INTERVAL_MS = 250;

/**
 * Drives `store.tick`. Time only accrues while the game is running (status
 * 'playing') AND the tab is visible; hiding the tab flushes the time up to
 * that moment and later time is not counted.
 */
export function useGameTimer(store: StoreApi<GameStore>): void {
  useEffect(() => {
    let last = Date.now();
    let visible = !document.hidden;
    const flush = () => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (visible && delta > 0) store.getState().tick(delta);
    };
    const onVisibility = () => {
      flush();
      visible = !document.hidden;
    };
    const id = window.setInterval(flush, TIMER_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [store]);
}
