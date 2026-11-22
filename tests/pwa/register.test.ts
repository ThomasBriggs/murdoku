import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateSW, registerSW, hooks } = vi.hoisted(() => {
  const hooks: { options?: { onNeedRefresh?: () => void } } = {};
  const updateSW = vi.fn<(reload?: boolean) => Promise<void>>(() => Promise.resolve());
  const registerSW = vi.fn((o?: { onNeedRefresh?: () => void }) => {
    hooks.options = o;
    return updateSW;
  });
  return { updateSW, registerSW, hooks };
});
vi.mock('virtual:pwa-register', () => ({ registerSW }));

import {
  applyUpdate,
  dismissUpdate,
  initPwa,
  onBeforeUpdate,
  resetPwaForTests,
  useUpdateStore,
} from '../../src/pwa/register';

function setServiceWorker(present: boolean) {
  if (present) Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  else delete (navigator as unknown as Record<string, unknown>).serviceWorker;
}

beforeEach(() => {
  registerSW.mockClear();
  updateSW.mockClear();
  hooks.options = undefined;
  resetPwaForTests();
  setServiceWorker(true);
});
afterEach(() => {
  setServiceWorker(false);
  delete (window as unknown as Record<string, unknown>).Cypress;
  delete (window as unknown as Record<string, unknown>).__murdokuShowUpdate;
});

describe('initPwa', () => {
  it('registers the worker when supported', () => {
    initPwa();
    expect(registerSW).toHaveBeenCalledTimes(1);
  });

  it('skips registration without service worker support', () => {
    setServiceWorker(false);
    initPwa();
    expect(registerSW).not.toHaveBeenCalled();
  });

  it('skips registration under Cypress but exposes a test hook', () => {
    (window as unknown as Record<string, unknown>).Cypress = {};
    initPwa();
    expect(registerSW).not.toHaveBeenCalled();
    (window as unknown as { __murdokuShowUpdate(): void }).__murdokuShowUpdate();
    expect(useUpdateStore.getState().needRefresh).toBe(true);
  });

  it('flips needRefresh when a new version is waiting', () => {
    initPwa();
    expect(useUpdateStore.getState().needRefresh).toBe(false);
    hooks.options?.onNeedRefresh?.();
    expect(useUpdateStore.getState().needRefresh).toBe(true);
  });
});

describe('applyUpdate and dismissUpdate', () => {
  it('runs the before-update hooks, then activates the new worker and reloads', async () => {
    initPwa();
    const order: string[] = [];
    onBeforeUpdate(() => order.push('flush'));
    updateSW.mockImplementationOnce(() => {
      order.push('update');
      return Promise.resolve();
    });
    await applyUpdate();
    expect(order).toEqual(['flush', 'update']);
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('still updates when a hook throws', async () => {
    initPwa();
    onBeforeUpdate(() => {
      throw new Error('quota');
    });
    await applyUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('dismissing hides the banner state for the session', () => {
    dismissUpdate();
    expect(useUpdateStore.getState().dismissed).toBe(true);
  });
});
