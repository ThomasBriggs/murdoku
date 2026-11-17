import { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useGameStore, type GameStore } from '../state/store';

export const StoreContext = createContext<StoreApi<GameStore> | null>(null);

export function useStoreApi(): StoreApi<GameStore> {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
}

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useGameStore(useStoreApi(), selector);
}
