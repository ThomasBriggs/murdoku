import { useEffect, useRef, useState } from 'react';
import { useGame, useStoreApi } from './context';
import { copyText, shareUrl } from './url';
import styles from '../App.module.css';
import { formatTime } from './time';
import { SettingsMenu, SettingsPanel } from './Toolbar';
import { useMediaQuery } from './useMediaQuery';
import { CheckIcon, GearIcon, MenuIcon, PlusIcon, ShareIcon, StatsIcon } from './icons/glyphs';

/** Slim one-line header: title, difficulty + timer, and icon buttons for the app-level actions. */
export function Header({
  onNewGame,
  onRules,
  onStats,
}: {
  onNewGame(): void;
  onRules(): void;
  onStats(): void;
}) {
  const store = useStoreApi();
  const settings = useGame((g) => g.settings);
  const puzzle = useGame((g) => g.puzzle);
  const elapsed = useGame((g) => g.elapsedMs);
  const status = useGame((g) => g.status);
  const [shared, setShared] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    if (shared === 'idle') return;
    const id = window.setTimeout(() => setShared('idle'), 4000);
    return () => window.clearTimeout(id);
  }, [shared]);
  // Puzzle link only: seed and difficulty, never any progress.
  const share = async () => {
    if (!puzzle) return;
    setShared((await copyText(shareUrl(puzzle.seed, puzzle.difficulty))) ? 'ok' : 'fail');
  };
  const mobile = useMediaQuery('(max-width: 600px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
  };
  // The menu only exists on phones.
  const open = mobile && menuOpen;
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !menuButton.current?.contains(t)) closeMenu();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  /** A plain menu action: focus goes back to the trigger first, so a dialog it opens returns there. */
  const act = (fn: () => void) => () => {
    menuButton.current?.focus();
    closeMenu();
    fn();
  };
  const shareTitle =
    shared === 'ok'
      ? 'Link copied'
      : shared === 'fail'
        ? 'Copy failed'
        : 'Share: copy a link to this puzzle (no progress included)';
  return (
    <header className={`${styles.header} print-hide`}>
      <h1 data-testid="app-title" className={styles.hTitle}>
        Murdoku
      </h1>
      {puzzle ? (
        <p className={styles.meta}>
          <span data-testid="puzzle-difficulty" className={styles.difficulty}>
            {puzzle.difficulty}
          </span>
          <span
            className={styles.timer}
            data-testid="timer"
            data-running={status === 'playing' ? 'true' : 'false'}
            role="timer"
            aria-label="Elapsed time"
          >
            {formatTime(elapsed)}
          </span>
          <span className={styles.seed}>
            seed <code data-testid="puzzle-seed">{puzzle.seed}</code>
          </span>
        </p>
      ) : (
        <span className={styles.meta} />
      )}
      <span className="sr-only" role="status" data-testid="share-status">
        {shared === 'ok' && 'Link to this puzzle copied.'}
        {shared === 'fail' && 'Could not copy the link.'}
      </span>
      <div className={styles.hActions}>
        <button
          type="button"
          className={styles.hBtn}
          data-testid="new-game-button"
          aria-label="New game"
          title="New game"
          onClick={onNewGame}
        >
          <PlusIcon />
        </button>
        {mobile ? (
          <button
            type="button"
            ref={menuButton}
            className={styles.hBtn}
            data-testid="header-menu-button"
            aria-label="Menu"
            title="Menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="header-menu"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          >
            <MenuIcon />
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.hBtn}
              data-testid="share-button"
              disabled={!puzzle}
              aria-label={shared === 'ok' ? 'Link copied' : 'Share'}
              title={
                shared === 'ok'
                  ? 'Link copied'
                  : shared === 'fail'
                    ? 'Copy failed'
                    : 'Share: copy a link to this puzzle (no progress included)'
              }
              onClick={() => void share()}
            >
              {shared === 'ok' ? <CheckIcon /> : <ShareIcon />}
            </button>
            <button
              type="button"
              className={styles.hBtn}
              data-testid="stats-button"
              aria-label="Statistics"
              title="Statistics"
              onClick={onStats}
            >
              <StatsIcon />
            </button>
            <button
              type="button"
              className={styles.hBtn}
              data-testid="rules-button"
              aria-label="Rules"
              title="Rules and shortcuts"
              onClick={onRules}
            >
              <span aria-hidden="true">?</span>
            </button>
            <SettingsMenu
              iconOnly
              className={styles.hBtn}
              settings={settings}
              onSettings={(patch) => store.getState().updateSettings(patch)}
            />
          </>
        )}
      </div>
      {open && (
        <div
          id="header-menu"
          ref={menuRef}
          className={styles.menu}
          role="group"
          aria-label="Menu"
          data-testid="header-menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeMenu();
              menuButton.current?.focus();
            }
          }}
        >
          <button
            type="button"
            className={styles.menuItem}
            data-testid="share-button"
            disabled={!puzzle}
            title={shareTitle}
            onClick={() => void share()}
          >
            {shared === 'ok' ? <CheckIcon /> : <ShareIcon />}
            <span>
              {shared === 'ok' ? 'Link copied' : shared === 'fail' ? 'Copy failed' : 'Share link'}
            </span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            data-testid="stats-button"
            onClick={act(onStats)}
          >
            <StatsIcon />
            <span>Statistics</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            data-testid="rules-button"
            onClick={act(onRules)}
          >
            <span className={styles.menuGlyph} aria-hidden="true">
              ?
            </span>
            <span>Rules</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            data-testid="settings-button"
            aria-expanded={settingsOpen}
            aria-controls="settings-popover"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <GearIcon />
            <span>Settings</span>
          </button>
          {settingsOpen && (
            <SettingsPanel
              inline
              settings={settings}
              onSettings={(patch) => store.getState().updateSettings(patch)}
            />
          )}
        </div>
      )}
    </header>
  );
}
