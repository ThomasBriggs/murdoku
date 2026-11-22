import { Fragment, type ReactNode } from 'react';
import { COLOR_IDS, type ColorId } from '../state/annotations';
import type { Tool } from '../state/store';
import {
  CrossIcon,
  DotIcon,
  DrawIcon,
  EliminateIcon,
  EraseIcon,
  HighlightIcon,
  PencilIcon,
  PlaceIcon,
  QuestionIcon,
  SelectIcon,
} from './icons/glyphs';
import { COLOR_INFO } from './colors';
import styles from './ToolPalette.module.css';

export interface ToolDef {
  id: Tool;
  label: string;
  Icon: (p: { className?: string }) => ReactNode;
  /** Keyboard shortcut shown in the tooltip; `key` is the matching KeyboardEvent.key (lower-case). */
  shortcut: string;
  key: string;
  help: string;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'place',
    label: 'Place',
    Icon: PlaceIcon,
    shortcut: 'V',
    key: 'v',
    help: 'Pick a person, then tap a cell to note them as a candidate there, or press and hold to place them (Enter places, Space notes)',
  },
  {
    id: 'pencil',
    label: 'Pencil',
    Icon: PencilIcon,
    shortcut: 'P',
    key: 'p',
    help: 'Tentative placement: a dashed guess that does not count',
  },
  {
    id: 'cross',
    label: 'Cross',
    Icon: CrossIcon,
    shortcut: 'X',
    key: 'x',
    help: 'Nobody is here (also right-click)',
  },
  {
    id: 'dot',
    label: 'Dot',
    Icon: DotIcon,
    shortcut: '.',
    key: '.',
    help: 'Someone could be here',
  },
  {
    id: 'unsure',
    label: 'Unsure',
    Icon: QuestionIcon,
    shortcut: '?',
    key: '?',
    help: 'Mark a cell to come back to',
  },
  {
    id: 'eliminate',
    label: 'Eliminate',
    Icon: EliminateIcon,
    shortcut: 'E',
    key: 'e',
    help: 'Slash a person’s initial: they are not in this cell (pick a person, or press 1-9)',
  },
  {
    id: 'erase',
    label: 'Erase',
    Icon: EraseIcon,
    shortcut: 'R',
    key: 'r',
    help: 'Wipe a cell clean: marks, initials, highlight and pencil guesses (also Delete)',
  },
  {
    id: 'highlight',
    label: 'Highlight',
    Icon: HighlightIcon,
    shortcut: 'C cycles colour',
    key: 'c',
    help: 'Fill cells with the chosen colour',
  },
  {
    id: 'select',
    label: 'Select',
    Icon: SelectIcon,
    shortcut: 'S',
    key: 's',
    help: 'Drag or Shift-click to select many cells, then apply a mark, colour or candidate to all',
  },
  {
    id: 'draw',
    label: 'Draw',
    Icon: DrawIcon,
    shortcut: 'D',
    key: 'd',
    help: 'Freehand pen, highlighter and eraser over the board (Esc to stop)',
  },
];

/** Tools that start a new visual group in the strip. */
const GROUP_START = new Set<Tool>(['cross', 'eliminate', 'highlight']);

export interface ToolPaletteProps {
  /** Only these tools, in this order (default: all, in palette order). */
  only?: readonly Tool[];
  /** Tools to leave out. */
  except?: readonly Tool[];
  showColors?: boolean;
  /** Wrap onto several lines instead of scrolling sideways (used in the mobile sheet). */
  wrap?: boolean;
  testId?: string;
  /** Compact icon-only strip (desktop): labels hidden, shortcut shown as a badge. */
  strip?: boolean;
  /**
   * Whether these tools' keyboard shortcuts are live (they are only on the quick bar). Off, the
   * tooltip says how to enable the key instead of advertising it.
   */
  shortcuts?: boolean;
  tool: Tool;
  color: ColorId;
  onTool(tool: Tool): void;
  onColor(color: ColorId): void;
}

export function ToolPalette(p: ToolPaletteProps) {
  const shown = (p.only ? p.only.flatMap((id) => TOOLS.filter((t) => t.id === id)) : TOOLS).filter(
    (t) => !p.except?.includes(t.id),
  );
  const keys = p.shortcuts !== false;
  return (
    <div
      className={`${styles.palette} ${p.wrap ? styles.wrapAll : ''} ${p.strip ? styles.strip : ''}`}
      role="toolbar"
      aria-label="Tools"
      data-testid={p.testId ?? 'tool-palette'}
    >
      <div className={styles.tools}>
        {shown.map((t, i) => (
          <Fragment key={t.id}>
            {p.strip && !p.only && i > 0 && GROUP_START.has(t.id) && (
              <span className={styles.groupSep} aria-hidden="true" />
            )}
            <button
              type="button"
              className={styles.tool}
              data-testid={`tool-${t.id}`}
              aria-pressed={p.tool === t.id}
              aria-keyshortcuts={keys ? t.key : undefined}
              aria-label={t.label}
              title={
                keys
                  ? `${t.label} (${t.shortcut}): ${t.help}`
                  : `${t.label}: ${t.help}. Pin it to the quick bar in Settings to use its key (${t.shortcut})`
              }
              onClick={() => p.onTool(t.id)}
            >
              <span className={styles.glyph} aria-hidden="true">
                <t.Icon />
              </span>
              <span className={styles.label}>{t.label}</span>
              {p.strip && keys && (
                <span className={styles.kbd} aria-hidden="true">
                  {t.key === 'c' ? 'C' : t.shortcut}
                </span>
              )}
            </button>
          </Fragment>
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
