import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import { StoreContext } from '../../src/ui/context';
import { Header } from '../../src/ui/Header';
import { initInstall, resetInstallForTests } from '../../src/pwa/install';
import { stubWidth } from './matchMedia';

const ITEMS = ['share-button', 'stats-button', 'rules-button', 'settings-button'];

function setup(width: number) {
  stubWidth(width);
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  const onNewGame = vi.fn();
  const onRules = vi.fn();
  const onStats = vi.fn();
  render(
    <StoreContext.Provider value={store}>
      <Header onNewGame={onNewGame} onRules={onRules} onStats={onStats} />
    </StoreContext.Provider>,
  );
  return { onNewGame, onRules, onStats };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // @ts-expect-error jsdom has no matchMedia; remove our stub
  delete window.matchMedia;
});

describe('header on desktop', () => {
  it('shows every button and no menu button', () => {
    setup(1280);
    for (const id of ['new-game-button', ...ITEMS]) expect(screen.getByTestId(id)).toBeVisible();
    expect(screen.queryByTestId('header-menu-button')).toBeNull();
    expect(screen.queryByTestId('header-menu')).toBeNull();
  });
});

describe('header on a phone', () => {
  it('shows New game and the menu button only', () => {
    setup(375);
    expect(screen.getByTestId('new-game-button')).toBeVisible();
    const btn = screen.getByTestId('header-menu-button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'header-menu');
    for (const id of ITEMS) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('New game stays outside the menu', () => {
    const { onNewGame } = setup(375);
    fireEvent.click(screen.getByTestId('new-game-button'));
    expect(onNewGame).toHaveBeenCalled();
  });

  it('opens to show share, statistics, rules and settings, and moves focus in', () => {
    setup(375);
    fireEvent.click(screen.getByTestId('header-menu-button'));
    expect(screen.getByTestId('header-menu-button')).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByTestId('header-menu');
    expect(menu).toHaveAttribute('id', 'header-menu');
    for (const id of ITEMS) expect(menu).toContainElement(screen.getByTestId(id));
    expect(menu.querySelector('button:not(:disabled)')).toHaveFocus();
  });

  it('Rules and Statistics call back and close the menu', () => {
    const { onRules, onStats } = setup(375);
    fireEvent.click(screen.getByTestId('header-menu-button'));
    fireEvent.click(screen.getByTestId('rules-button'));
    expect(onRules).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('header-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('header-menu-button'));
    fireEvent.click(screen.getByTestId('stats-button'));
    expect(onStats).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('header-menu')).toBeNull();
  });

  it('Settings toggles the panel inline and the menu stays open', () => {
    setup(375);
    fireEvent.click(screen.getByTestId('header-menu-button'));
    const settings = screen.getByTestId('settings-button');
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(settings);
    expect(settings).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('header-menu')).toContainElement(
      screen.getByTestId('settings-popover'),
    );
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(screen.getByTestId('theme-dark')).toBeChecked();
    expect(screen.getByTestId('header-menu')).toBeInTheDocument();
    fireEvent.click(settings);
    expect(screen.queryByTestId('settings-popover')).toBeNull();
    expect(screen.getByTestId('header-menu')).toBeInTheDocument();
  });

  it('Escape closes the menu and returns focus to the menu button', () => {
    setup(375);
    const btn = screen.getByTestId('header-menu-button');
    fireEvent.click(btn);
    fireEvent.keyDown(screen.getByTestId('rules-button'), { key: 'Escape' });
    expect(screen.queryByTestId('header-menu')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('a press outside closes the menu; a press on the menu does not', () => {
    setup(375);
    fireEvent.click(screen.getByTestId('header-menu-button'));
    fireEvent.pointerDown(screen.getByTestId('header-menu'));
    expect(screen.getByTestId('header-menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('header-menu')).toBeNull();
  });
});

describe('install app item', () => {
  let stop: () => void;
  beforeEach(() => {
    resetInstallForTests();
    stop = initInstall();
  });
  afterEach(() => stop());

  const installable = () => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(() => Promise.resolve());
    Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    act(() => void window.dispatchEvent(e));
    return prompt;
  };

  it('only appears once the browser says the app is installable (desktop)', () => {
    setup(1280);
    expect(screen.queryByTestId('install-button')).toBeNull();
    const prompt = installable();
    fireEvent.click(screen.getByTestId('install-button'));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('is a menu item on a phone, and closes the menu', () => {
    setup(375);
    fireEvent.click(screen.getByTestId('header-menu-button'));
    expect(screen.queryByTestId('install-button')).toBeNull();
    const prompt = installable();
    fireEvent.click(screen.getByTestId('install-button'));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('header-menu')).toBeNull();
  });
});
