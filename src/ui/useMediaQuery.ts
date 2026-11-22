import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query (false where matchMedia does not exist, e.g. jsdom). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener('change', notify);
      return () => mq?.removeEventListener('change', notify);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
