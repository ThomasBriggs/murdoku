import { memo, useEffect, type CSSProperties, type ReactNode } from 'react';
import { FURNITURE, isOccupiable } from '../engine/furniture';
import type { FurnitureType, Person, Room } from '../engine/types';
import type { ColorId, MarkKind } from '../state/annotations';
import styles from './Cell.module.css';
import { FurnitureIcon } from './icons/FurnitureIcon';
import type { RoomColor } from './roomColors';
import { Token } from './Token';
import { COLUMN_LETTERS, type PersonMark } from './types';
import type { Walls } from './walls';

export interface CellProps {
  r: number;
  c: number;
  room: Room;
  color: RoomColor;
  furniture: FurnitureType | null;
  walls: Walls;
  /** Show the room name label (first cell of the room). */
  roomLabel: boolean;
  person: Person | null;
  /** Rule messages for the placed person (empty = no conflict shown). */
  conflicts: readonly string[];
  autoCross: boolean;
  highlighted: boolean;
  /** The hovered person card is placed, pencilled in, or noted as a candidate here. */
  personMark?: PersonMark;
  /** The placed person here is the currently selected one. */
  selected: boolean;
  /** Roving-tabindex cursor is on this cell. */
  cursor: boolean;
  shaking: boolean;
  /** Ruled out by the selected person's clue (assist, SPEC §6.5.9). */
  dimmed?: boolean;
  /** Possible for the selected person according to the player's logic grid. */
  possible?: boolean;
  /** Hint highlight: the cell the deduction decides, or one the reasoning is about. */
  hint?: 'target' | 'involved';
  /** The placed person here was flagged wrong by a check or hint. */
  wrong?: boolean;
  /** Show the small ✕ that takes the placed person off the board. */
  removable?: boolean;
  onRemove?(person: Person): void;
  onActivate(r: number, c: number, mods?: ActivateMods): void;
  onFocusCell(r: number, c: number): void;
  onContextMenu?(r: number, c: number): void;
  /** Double-click on the room label selects the whole room. */
  onRoomLabelDouble?(room: number): void;
  /** Player's note for this room (shown as a badge on the label). */
  roomNote?: string;
  /** Toolkit state, exposed as data attributes for tests and styling. */
  ann?: CellAnn;
  /** Visuals of the annotation toolkit (marks, candidates, highlight, tentative tokens). */
  annotations?: ReactNode;
}

export interface ActivateMods {
  shift?: boolean;
  keyboard?: boolean;
}

export interface CellAnn {
  mark?: MarkKind;
  color?: ColorId;
  /** Part of the multi-selection. */
  inSelection: boolean;
  /** Person ids with a candidate / eliminated initial, and tentative placements. */
  candidates: number[];
  eliminated: number[];
  tentative: number[];
}

export function cellLabel(
  r: number,
  c: number,
  roomName: string,
  furniture: FurnitureType | null,
  person: Person | null,
): string {
  const f = furniture ? FURNITURE[furniture].label.toLowerCase() : 'no furniture';
  const blocked = furniture !== null && !isOccupiable(furniture);
  const state = person ? person.name : blocked ? 'blocked' : 'empty';
  return `Row ${r + 1}, column ${COLUMN_LETTERS[c]}, ${roomName}, ${f}, ${state}`;
}

let renderProbe: ((r: number, c: number) => void) | null = null;
/** Test hook: called after every committed render of any Cell (used by the re-render guard). */
export function setCellRenderProbe(fn: ((r: number, c: number) => void) | null) {
  renderProbe = fn;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

function sameAnn(a: CellAnn | undefined, b: CellAnn | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.mark === b.mark &&
    a.color === b.color &&
    a.inSelection === b.inSelection &&
    sameList(a.candidates, b.candidates) &&
    sameList(a.eliminated, b.eliminated) &&
    sameList(a.tentative, b.tentative)
  );
}

/**
 * Re-render a cell only when something it shows changed. Callbacks are ignored (the parent
 * passes inline wrappers around stable store actions), and `annotations` is derived from `ann`.
 */
function cellPropsEqual(a: CellProps, b: CellProps) {
  for (const k of Object.keys(a) as (keyof CellProps)[]) {
    if (k === 'annotations' || typeof a[k] === 'function') continue;
    if (k === 'ann') {
      if (!sameAnn(a.ann, b.ann)) return false;
    } else if (k === 'conflicts') {
      if (!sameList(a.conflicts, b.conflicts)) return false;
    } else if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

export const Cell = memo(function Cell(p: CellProps) {
  useEffect(() => {
    renderProbe?.(p.r, p.c);
  });
  const { r, c, room, furniture, walls, person } = p;
  const blocked = furniture !== null && !isOccupiable(furniture);
  const hasConflict = p.conflicts.length > 0;
  const descId = `cell-desc-${r}-${c}`;
  const title = furniture
    ? `${FURNITURE[furniture].label}: ${blocked ? 'blocked' : 'can stand here'}`
    : undefined;
  const cls = [
    styles.cell,
    walls.top && styles.wallT,
    walls.left && styles.wallL,
    walls.right && c === 8 && styles.wallR,
    walls.bottom && r === 8 && styles.wallB,
    blocked && styles.blocked,
    p.highlighted && styles.highlight,
    p.personMark === 'placed' && styles.pmPlaced,
    p.personMark === 'tentative' && styles.pmTentative,
    p.personMark === 'candidate' && styles.pmCandidate,
    p.selected && styles.selected,
    p.ann?.inSelection && styles.inSel,
    (p.ann?.mark === 'cross' || p.ann?.tentative.length) && styles.crossed,
    (person || p.ann?.tentative.length) && styles.occupied,
    p.shaking && styles.shake,
    p.dimmed && styles.dim,
    p.possible && styles.possible,
    p.hint === 'target' && styles.hintTarget,
    p.hint === 'involved' && styles.hintInvolved,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      role="gridcell"
      className={cls}
      style={{ '--room-l': p.color.light, '--room-d': p.color.dark } as CSSProperties}
      tabIndex={p.cursor ? 0 : -1}
      aria-label={cellLabel(r, c, room.name, furniture, person)}
      aria-describedby={hasConflict ? descId : undefined}
      aria-selected={p.selected || undefined}
      title={title}
      data-testid={`cell-${r}-${c}`}
      data-r={r}
      data-c={c}
      data-room={room.id}
      data-furniture={furniture ?? ''}
      data-blocked={blocked ? 'true' : 'false'}
      data-occupant={person ? person.id : ''}
      data-autocross={p.autoCross ? 'true' : undefined}
      data-highlight={p.highlighted ? 'true' : undefined}
      data-person-mark={p.personMark}
      data-mark={p.ann?.mark || undefined}
      data-hl-color={p.ann?.color || undefined}
      data-dim={p.dimmed ? 'true' : undefined}
      data-possible={p.possible ? 'true' : undefined}
      data-hint={p.hint}
      data-sel={p.ann?.inSelection ? 'true' : undefined}
      data-candidates={p.ann?.candidates.length ? p.ann.candidates.join(',') : undefined}
      data-eliminated={p.ann?.eliminated.length ? p.ann.eliminated.join(',') : undefined}
      data-tentative={p.ann?.tentative.length ? p.ann.tentative.join(',') : undefined}
      onClick={(e) => p.onActivate(r, c, { shift: e.shiftKey })}
      onContextMenu={
        p.onContextMenu
          ? (e) => {
              e.preventDefault();
              p.onContextMenu?.(r, c);
            }
          : undefined
      }
      onFocus={() => p.onFocusCell(r, c)}
    >
      {p.roomLabel && (
        <span
          className={styles.roomLabel}
          aria-hidden="true"
          data-testid={`room-label-${room.id}`}
          data-note={p.roomNote ? 'true' : undefined}
          title={p.roomNote ? `${room.name}: ${p.roomNote}` : 'Double-click to select the room'}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => p.onRoomLabelDouble?.(room.id)}
        >
          {room.name}
          {p.roomNote && <span className={styles.noteBadge}> ✎</span>}
        </span>
      )}
      {furniture && (
        <span className={styles.furniture} data-testid={`furniture-${r}-${c}`}>
          <FurnitureIcon type={furniture} />
        </span>
      )}
      {p.autoCross && (
        <svg
          className={styles.autoCross}
          viewBox="0 0 10 10"
          aria-hidden="true"
          data-testid={`autocross-${r}-${c}`}
        >
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      )}
      {p.annotations && <div className={styles.annotations}>{p.annotations}</div>}
      {person && (
        <span className={styles.person}>
          <Token
            person={person}
            conflict={hasConflict}
            wrong={p.wrong}
            describedBy={hasConflict ? descId : undefined}
          />
          {p.removable && p.onRemove && (
            <button
              type="button"
              className={styles.unplace}
              tabIndex={-1}
              data-testid={`unplace-${person.id}`}
              title={`Take ${person.name} off the board`}
              aria-label={`Take ${person.name} off the board`}
              onClick={(e) => {
                e.stopPropagation();
                p.onRemove?.(person);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
              </svg>
            </button>
          )}
        </span>
      )}
      {hasConflict && (
        <span id={descId} className="sr-only">
          {p.conflicts.join(' ')}
        </span>
      )}
    </div>
  );
}, cellPropsEqual);
