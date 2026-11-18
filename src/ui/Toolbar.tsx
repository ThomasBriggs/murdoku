import { useState, type ReactNode } from 'react';
import type { Settings, Theme } from '../state/store';
import { GearIcon, RedoIcon, ResetIcon, UndoIcon } from './icons/glyphs';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canReset: boolean;
  settings: Settings;
  /** Hide the Undo button (the mobile bar has its own). */
  compact?: boolean;
  onUndo(): void;
  onRedo(): void;
  onReset(): void;
  onSettings(patch: Partial<Settings>): void;
  /** Slot for later milestones' tool buttons (marks, pen, hint, check, ...). */
  children?: ReactNode;
}

const THEMES: Theme[] = ['system', 'light', 'dark'];

export function Toolbar(p: ToolbarProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Board tools" data-testid="toolbar">
      {!p.compact && (
        <button
          type="button"
          data-testid="undo"
          disabled={!p.canUndo}
          onClick={p.onUndo}
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon className={styles.icon} />
          <span>Undo</span>
        </button>
      )}
      <button
        type="button"
        data-testid="redo"
        disabled={!p.canRedo}
        onClick={p.onRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <RedoIcon className={styles.icon} />
        <span>Redo</span>
      </button>
      <button
        type="button"
        data-testid="reset"
        disabled={!p.canReset}
        onClick={p.onReset}
        title="Reset board"
      >
        <ResetIcon className={styles.icon} />
        <span>Reset</span>
      </button>
      {p.children}
      <span className={styles.spacer} />
      <div className={styles.settingsWrap}>
        <button
          type="button"
          data-testid="settings-button"
          aria-expanded={open}
          aria-controls="settings-popover"
          onClick={() => setOpen((o) => !o)}
          title="Settings"
        >
          <GearIcon className={styles.icon} />
          <span>Settings</span>
        </button>
        {open && (
          <div
            id="settings-popover"
            className={`${styles.popover} ${p.compact ? styles.popoverLeft : ''}`}
            role="group"
            aria-label="Settings"
            data-testid="settings-popover"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
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
        )}
      </div>
    </div>
  );
}
