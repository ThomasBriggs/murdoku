/**
 * Service worker registration and the "new version available" state.
 *
 * The worker only caches the app shell (see vite.config.ts); it never touches puzzle
 * data or saved games. Registration is skipped where there is no service worker support
 * and under Cypress (a worker would cache stale builds between specs).
 */
import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

interface UpdateState {
  /** A new version is installed and waiting; offer the reload banner. */
  needRefresh: boolean;
  /** The player chose Later; stay quiet for the rest of the session. */
  dismissed: boolean;
}

export const useUpdateStore = create<UpdateState>(() => ({ needRefresh: false, dismissed: false }));

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
const beforeUpdate = new Set<() => void>();

/** Run `fn` just before the page reloads for an update (e.g. flush the pending game save). */
export function onBeforeUpdate(fn: () => void): () => void {
  beforeUpdate.add(fn);
  return () => {
    beforeUpdate.delete(fn);
  };
}

/** Activate the waiting worker and reload. Saves are flushed first. */
export async function applyUpdate(): Promise<void> {
  for (const fn of beforeUpdate) {
    try {
      fn();
    } catch {
      // A failed save must not block the update.
    }
  }
  await updateSW?.(true);
}

export function dismissUpdate(): void {
  useUpdateStore.setState({ dismissed: true });
}

interface TestHooks {
  Cypress?: unknown;
  __murdokuShowUpdate?: () => void;
}

/** Register the service worker (once, after the first render). Never throws. */
export function initPwa(): void {
  const w = window as unknown as TestHooks;
  if (w.Cypress) {
    // Lets specs show the banner without a real worker.
    w.__murdokuShowUpdate = () => useUpdateStore.setState({ needRefresh: true, dismissed: false });
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  try {
    updateSW = registerSW({
      onNeedRefresh() {
        useUpdateStore.setState({ needRefresh: true });
      },
    });
  } catch {
    // Offline support is an enhancement; the game works without it.
  }
  // Ask the browser not to evict the saved game under storage pressure.
  try {
    void navigator.storage?.persist?.()?.catch(() => undefined);
  } catch {
    // ignore
  }
}

/** Test helper: forget registration state. */
export function resetPwaForTests(): void {
  updateSW = undefined;
  beforeUpdate.clear();
  useUpdateStore.setState({ needRefresh: false, dismissed: false });
}
