import { TOOLS } from './ToolPalette';

export interface Shortcut {
  id: string;
  /** Human-readable key(s), e.g. "Ctrl+Z". */
  keys: string;
  label: string;
  group: 'Playing' | 'Tools' | 'Panels';
}

/** Keys that are not tool-bound. Tool keys come from TOOLS so the two never drift apart. */
const FIXED: readonly Shortcut[] = [
  { id: 'arrows', keys: 'Arrow keys', label: 'Move the cell cursor', group: 'Playing' },
  { id: 'digits', keys: '1–9', label: 'Select a person (victim is 1)', group: 'Playing' },
  { id: 'place', keys: 'Enter', label: 'Place the selected person on the cell', group: 'Playing' },
  {
    id: 'note',
    keys: 'Space',
    label: 'Note the selected person as a candidate in the cell',
    group: 'Playing',
  },
  { id: 'escape', keys: 'Esc', label: 'Deselect, or close a dialog', group: 'Playing' },
  { id: 'undo', keys: 'Ctrl+Z', label: 'Undo', group: 'Playing' },
  { id: 'redo', keys: 'Ctrl+Shift+Z', label: 'Redo', group: 'Playing' },
  {
    id: 'clear',
    keys: 'Delete',
    label: 'Wipe marks, initials, highlights and guesses from the cell or selection',
    group: 'Playing',
  },
  { id: 'logic', keys: 'G', label: 'Show or hide the logic grid', group: 'Panels' },
  { id: 'whatif', keys: 'W', label: 'Start or end a what-if (Shift+W nests)', group: 'Panels' },
];

export const SHORTCUTS: readonly Shortcut[] = [
  ...FIXED,
  ...TOOLS.map<Shortcut>((t) => ({
    id: `tool-${t.id}`,
    keys: t.shortcut,
    label: `${t.label} tool`,
    group: 'Tools',
  })),
];

/** The key label for a shortcut id, or undefined. */
export function shortcutKeys(id: string): string | undefined {
  return SHORTCUTS.find((s) => s.id === id)?.keys;
}

/** Tooltip text: "Hint (H)". */
export function withShortcut(label: string, id: string): string {
  const keys = shortcutKeys(id);
  return keys ? `${label} (${keys})` : label;
}
