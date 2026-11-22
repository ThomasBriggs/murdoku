/**
 * "Install app": captures the browser's install prompt so the header menu can offer it.
 *
 * Only Chromium-style browsers fire `beforeinstallprompt`; elsewhere (iOS Safari) there is
 * no item and players use Share, then Add to Home Screen.
 */
import { create } from 'zustand';

/** The non-standard install prompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const useInstallStore = create<{ canInstall: boolean }>(() => ({ canInstall: false }));

function clear() {
  deferred = null;
  useInstallStore.setState({ canInstall: false });
}

const isStandalone = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(display-mode: standalone)').matches;

/** Start listening. Call once, as early as possible (the event can fire before first render). */
export function initInstall(): () => void {
  if (isStandalone()) return () => undefined;
  const onPrompt = (e: Event) => {
    e.preventDefault(); // keep the event for our own menu item instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    useInstallStore.setState({ canInstall: true });
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', clear);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', clear);
  };
}

export function useCanInstall(): boolean {
  return useInstallStore((s) => s.canInstall);
}

/** Show the browser's install dialog. The event is single-use, so the item goes away afterwards. */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  clear();
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    // The prompt can only be used once and may reject; nothing to recover.
  }
}

/** Test helper. */
export function resetInstallForTests(): void {
  clear();
}
