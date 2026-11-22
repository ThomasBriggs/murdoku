import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  initInstall,
  promptInstall,
  resetInstallForTests,
  useCanInstall,
} from '../../src/pwa/install';

function promptEvent() {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  const userChoice = Promise.resolve({ outcome: 'accepted' as const });
  Object.assign(e, { prompt, userChoice });
  return { e, prompt };
}

let stop: () => void;
beforeEach(() => {
  resetInstallForTests();
  stop = initInstall();
});
afterEach(() => {
  stop();
  // @ts-expect-error jsdom has no matchMedia; remove any stub
  delete window.matchMedia;
});

describe('install prompt', () => {
  it('becomes installable on beforeinstallprompt and suppresses the default', () => {
    const { result } = renderHook(() => useCanInstall());
    expect(result.current).toBe(false);
    const { e } = promptEvent();
    act(() => void window.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(result.current).toBe(true);
  });

  it('promptInstall shows the browser prompt once, then hides the item', async () => {
    const { result } = renderHook(() => useCanInstall());
    const { e, prompt } = promptEvent();
    act(() => void window.dispatchEvent(e));
    await act(() => promptInstall());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
    await promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('is cleared by appinstalled', () => {
    const { result } = renderHook(() => useCanInstall());
    act(() => void window.dispatchEvent(promptEvent().e));
    expect(result.current).toBe(true);
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(result.current).toBe(false);
  });

  it('does nothing when already running as an installed app', () => {
    stop();
    window.matchMedia = ((q: string) => ({
      matches: q.includes('standalone'),
    })) as typeof window.matchMedia;
    stop = initInstall();
    const { result } = renderHook(() => useCanInstall());
    act(() => void window.dispatchEvent(promptEvent().e));
    expect(result.current).toBe(false);
  });
});
