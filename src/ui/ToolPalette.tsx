import { COLOR_IDS, type ColorId } from '../state/annotations';
import type { Tool } from '../state/store';
import { COLOR_INFO } from './colors';
import styles from './ToolPalette.module.css';

export interface ToolDef {
  id: Tool;
  label: string;
  glyph: string;
  /** Keyboard shortcut shown in the tooltip; `key` is the matching KeyboardEvent.key (lower-case). */
  shortcut: string;
  key: string;
  help: string;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'place',
    label: 'Place',
    glyph: '☻',
    shortcut: 'V',
    key: 'v',
    help: 'Pick a person, then click a cell to place them',
  },
  {
    id: 'pencil',
    label: 'Pencil',
    glyph: '✎',
    shortcut: 'P',
    key: 'p',
    help: 'Tentative placement: a dashed guess that does not count',
  },
  {
    id: 'cross',
    label: 'Cross',
    glyph: '✗',
    shortcut: 'X',
    key: 'x',
    help: 'Nobody is here (also right-click)',
  },
  { id: 'dot', label: 'Dot', glyph: '•', shortcut: '.', key: '.', help: 'Someone could be here' },
  {
    id: 'unsure',
    label: 'Unsure',
    glyph: '?',
    shortcut: '?',
    key: '?',
    help: 'Mark a cell to come back to',
  },
  {
    id: 'notes',
    label: 'Notes',
    glyph: '▦',
    shortcut: 'N',
    key: 'n',
    help: 'Candidate initials: pick a person (or press 1-9) and click cells. Hold Shift to eliminate',
  },
  {
    id: 'eliminate',
    label: 'Eliminate',
    glyph: '⊘',
    shortcut: 'E',
    key: 'e',
    help: 'Slash a person’s initial: they are not in this cell (same as Shift in Notes)',
  },
  {
    id: 'highlight',
    label: 'Highlight',
    glyph: '▨',
    shortcut: 'C cycles colour',
    key: 'c',
    help: 'Fill cells with the chosen colour',
  },
  {
    id: 'select',
    label: 'Select',
    glyph: '⬚',
    shortcut: 'S',
    key: 's',
    help: 'Drag or Shift-click to select many cells, then apply a mark, colour or candidate to all',
  },
];

/** Tools on the compact mobile bar; the rest live in its "More" sheet. */
export const PRIMARY_TOOLS: readonly Tool[] = ['place', 'pencil', 'cross', 'notes', 'highlight'];

export interface ToolPaletteProps {
  /** Only these tools (default: all). */
  only?: readonly Tool[];
  /** Tools to leave out. */
  except?: readonly Tool[];
  showColors?: boolean;
  /** Wrap onto several lines instead of scrolling sideways (used in the mobile sheet). */
  wrap?: boolean;
  testId?: string;
  tool: Tool;
  color: ColorId;
  onTool(tool: Tool): void;
  onColor(color: ColorId): void;
}

export function ToolPalette(p: ToolPaletteProps) {
  const shown = TOOLS.filter(
    (t) => (!p.only || p.only.includes(t.id)) && !p.except?.includes(t.id),
  );
  return (
    <div
      className={`${styles.palette} ${p.wrap ? styles.wrapAll : ''}`}
      role="toolbar"
      aria-label="Tools"
      data-testid={p.testId ?? 'tool-palette'}
    >
      <div className={styles.tools}>
        {shown.map((t) => (
          <button
            type="button"
            key={t.id}
            className={styles.tool}
            data-testid={`tool-${t.id}`}
            aria-pressed={p.tool === t.id}
            aria-keyshortcuts={t.key}
            aria-label={t.label}
            title={`${t.label} (${t.shortcut}): ${t.help}`}
            onClick={() => p.onTool(t.id)}
          >
            <span className={styles.glyph} aria-hidden="true">
              {t.glyph}
            </span>
            <span className={styles.label}>{t.label}</span>
          </button>
        ))}
      </div>
      {p.showColors !== false && <ColorPicker color={p.color} onColor={p.onColor} />}
    </div>
  );
}

export function ColorPicker({ color, onColor }: { color: ColorId; onColor(c: ColorId): void }) {
  return (
    <div className={styles.colors} role="radiogroup" aria-label="Highlight colour">
      {COLOR_IDS.map((c) => (
        <button
          type="button"
          key={c}
          role="radio"
          className={styles.swatch}
          data-color={c}
          data-testid={`color-${c}`}
          aria-checked={color === c}
          title={`${COLOR_INFO[c].label} (${COLOR_INFO[c].pattern}). Press C to cycle`}
          aria-label={`${COLOR_INFO[c].label} highlight`}
          onClick={() => onColor(c)}
        >
          {COLOR_INFO[c].glyph}
        </button>
      ))}
    </div>
  );
}
