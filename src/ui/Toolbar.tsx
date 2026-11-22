import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QUICK_ITEMS, type QuickItem, type Settings, type Theme } from '../state/store';
import { GearIcon, RedoIcon, TrayIcon, UndoIcon } from './icons/glyphs';
import { TOOLS } from './ToolPalette';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  /** The mobile "More" sheet: everything in one flat, wrapping list (Undo/Redo live on the bar). */
  compact?: boolean;
  onUndo(): void;
  onRedo(): void;
  /** Primary game actions after Undo/Redo (Hint, Check, Accuse). */
  children?: ReactNode;
  /** Secondary actions: an overflow menu on desktop, inline in the mobile sheet. */
  secondary?: ReactNode;
}

const THEMES: Theme[] = ['system', 'light', 'dark'];

/** What a quick-bar item is called, and its key. */
export function quickItemInfo(item: QuickItem): { label: string; key: string } {
  if (item === 'logic') return { label: 'Logic grid', key: 'G' };
  if (item === 'whatif') return { label: 'What-if', key: 'W' };
  const t = TOOLS.find((x) => x.id === item)!;
  return { label: t.label, key: t.key === 'c' ? 'C' : t.shortcut };
}

export function Toolbar(p: ToolbarProps) {
  const redo = (
    <button
      type="button"
      data-testid="redo"
      disabled={!p.canRedo}
      onClick={p.onRedo}
      title="Redo (Ctrl+Shift+Z)"
      aria-label="Redo"
    >
      <RedoIcon className={styles.icon} />
      <span className={styles.actionLabel}>Redo</span>
    </button>
  );
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Board actions" data-testid="toolbar">
      {!p.compact && (
        <button
          type="button"
          data-testid="undo"
          disabled={!p.canUndo}
          onClick={p.onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon className={styles.icon} />
          <span className={styles.actionLabel}>Undo</span>
        </button>
      )}
      {!p.compact && redo}
      {!p.compact && <span className={styles.sep} aria-hidden="true" />}
      {p.children}
      {p.secondary &&
        (p.compact ? (
          <div className={styles.flat}>{p.secondary}</div>
        ) : (
          <OverflowMenu>{p.secondary}</OverflowMenu>
        ))}
    </div>
  );
}

/** The desktop "more" menu: secondary actions in a popover that closes after a plain action. */
export function OverflowMenu({ children, up }: { children: ReactNode; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div
      className={`${styles.settingsWrap} ${up ? styles.dockOverflow : styles.overflowWrap}`}
      ref={wrap}
    >
      <button
        type="button"
        ref={trigger}
        data-testid="overflow-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="overflow-menu"
        aria-label="Tray: more tools and actions"
        title="Tray: the other tools, plus reset, layers, clear, what-if, logic grid and print"
        onClick={() => setOpen((o) => !o)}
      >
        <TrayIcon className={styles.icon} />
      </button>
      {open && (
        <div
          id="overflow-menu"
          className={`${styles.overflow} ${up ? styles.overflowUp : ''}`}
          role="group"
          aria-label="Tray"
          data-testid="overflow-menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
          onClick={(e) => {
            // Plain actions close the menu; the layers/clear/settings openers (aria-expanded) do not.
            const b = (e.target as HTMLElement).closest('button');
            if (b && !b.hasAttribute('aria-expanded')) {
              // Focus goes back to the trigger first, so a dialog opened by the action returns here.
              trigger.current?.focus();
              setOpen(false);
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** The settings controls (helpers, quick bar, theme), shared by the header popover and the phone menu. */
export function SettingsPanel({
  settings,
  onSettings,
  inline,
  className = '',
  onEscape,
}: {
  settings: Settings;
  onSettings(patch: Partial<Settings>): void;
  /** Sits in the flow (inside the phone menu) instead of floating as a popover. */
  inline?: boolean;
  className?: string;
  onEscape?(): void;
}) {
  const p = { settings, onSettings };
  return (
    <div
      id="settings-popover"
      className={`${styles.popover} ${inline ? styles.popoverInline : ''} ${className}`}
      role="group"
      aria-label="Settings"
      data-testid="settings-popover"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onEscape?.();
      }}
    >
      <label>
        <input
          type="checkbox"
          data-testid="setting-autocross"
          checked={p.settings.autoCross}
          onChange={(e) => p.onSettings({ autoCross: e.target.checked })}
        />
        Auto-cross row and column
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="setting-conflicts"
          checked={p.settings.conflictHighlight}
          onChange={(e) => p.onSettings({ conflictHighlight: e.target.checked })}
        />
        Highlight conflicts
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="setting-autoclear"
          checked={p.settings.autoClearCandidates}
          onChange={(e) => p.onSettings({ autoClearCandidates: e.target.checked })}
        />
        Clear a person’s candidate initials once placed
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="setting-linklogic"
          checked={p.settings.linkLogicGrid}
          onChange={(e) => p.onSettings({ linkLogicGrid: e.target.checked })}
        />
        Logic grid ticks shade the selected person’s cells
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="setting-clueallows"
          checked={p.settings.showClueAllows}
          onChange={(e) => p.onSettings({ showClueAllows: e.target.checked })}
        />
        Show where the selected person’s clue allows (counts as an assist)
      </label>
      <fieldset className={styles.quick} data-testid="quickbar-settings">
        <legend>Quick bar</legend>
        <p className={styles.hint}>
          Place is always there. A tool’s keyboard shortcut only works while it is on the bar; the
          rest are in the tray.
        </p>
        {QUICK_ITEMS.map((q) => {
          const { label, key } = quickItemInfo(q);
          const on = p.settings.quickBar.includes(q);
          return (
            <label key={q}>
              <input
                type="checkbox"
                data-testid={`quickbar-${q}`}
                checked={on}
                onChange={(e) =>
                  p.onSettings({
                    quickBar: QUICK_ITEMS.filter((x) =>
                      x === q ? e.target.checked : p.settings.quickBar.includes(x),
                    ),
                  })
                }
              />
              {label} <kbd>{key}</kbd>
            </label>
          );
        })}
      </fieldset>
      <fieldset className={styles.theme}>
        <legend>Theme</legend>
        {THEMES.map((t) => (
          <label key={t}>
            <input
              type="radio"
              name="theme"
              data-testid={`theme-${t}`}
              checked={p.settings.theme === t}
              onChange={() => p.onSettings({ theme: t })}
            />
            {t[0]!.toUpperCase() + t.slice(1)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** Settings button with its popover (theme and helper toggles). */
export function SettingsMenu({
  settings,
  onSettings,
  compact,
  iconOnly,
  className,
}: {
  settings: Settings;
  onSettings(patch: Partial<Settings>): void;
  compact?: boolean;
  /** Header variant: a bare gear whose popover drops down from the right edge. */
  iconOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.settingsWrap}>
      <button
        type="button"
        className={className}
        aria-label="Settings"
        data-testid="settings-button"
        aria-expanded={open}
        aria-controls="settings-popover"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
      >
        <GearIcon className={styles.icon} />
        {!iconOnly && <span>Settings</span>}
      </button>
      {open && (
        <SettingsPanel
          settings={settings}
          onSettings={onSettings}
          className={`${compact ? styles.popoverLeft : ''} ${iconOnly ? styles.popoverRight : ''}`}
          onEscape={() => setOpen(false)}
        />
      )}
    </div>
  );
}
