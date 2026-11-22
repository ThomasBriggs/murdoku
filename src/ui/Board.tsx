import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { HOLD_MS } from './hold';
import { GRID_SIZE } from '../engine/constants';
import { cellKey, type Person, type PersonId, type PuzzleView } from '../engine/types';
import type { Annotations } from '../state/annotations';
import { colCells, rowCells } from '../state/selection';
import type { Tool } from '../state/store';
import styles from './Board.module.css';
import { holdCandidates } from './candidatePick';
import { RadialPick } from './RadialPick';
import { Cell, type ActivateMods, type CellAnn } from './Cell';
import { CellMarks, type CandidateView } from './CellMarks';
import { DrawingLayer, type DrawingProps } from './DrawingLayer';
import type { RoomColor } from './roomColors';
import { COLUMN_LETTERS, panelOrder, type Highlight, type PersonMark } from './types';
import { firstCellOfRooms } from './walls';
import { WallLayer } from './WallLayer';

export interface BoardProps {
  puzzle: PuzzleView;
  roomColors: Map<number, RoomColor>;
  placements: Record<PersonId, number | null>;
  tentative: Record<PersonId, number | null>;
  annotations: Annotations;
  selection: ReadonlySet<number>;
  tool: Tool;
  selectedPerson: PersonId | null;
  cursor: { r: number; c: number };
  highlight: Highlight | null;
  conflicts: Map<PersonId, string[]>;
  autoCross: boolean;
  conflictHighlight: boolean;
  shakeCell: number | null;
  /** Cells the selected person's clue rules out (assist) and cells their logic-grid ticks allow. */
  dimmed?: ReadonlySet<number>;
  possible?: ReadonlySet<number>;
  /** People whose token is flagged wrong by a check. */
  wrongPeople?: ReadonlySet<PersonId>;
  /** The puzzle is solved: the board is view-only. */
  solved?: boolean;
  /** Open what-if depth (0 = none); tints the board. */
  whatIfLevel?: number;
  draw: Omit<DrawingProps, 'strokes' | 'visible'>;
  onCursor(r: number, c: number): void;
  /** Open radial "who to place here?" menu (hold on a cell with several noted people). */
  pick?: { key: number; people: PersonId[] } | null;
  onPick?(person: PersonId): void;
  onPickClose?(): void;
  onActivate(r: number, c: number, mods?: ActivateMods): void;
  onContextMenu(r: number, c: number): void;
  onSelectPerson(id: PersonId | null): void;
  /** Number key in Eliminate mode: slash that person's candidate. */
  onCandidateKey(person: PersonId, eliminate: boolean, cell: { r: number; c: number }): void;
  /** Drag produced a multi-selection of these cells. */
  onDragSelect(cells: number[], additive: boolean): void;
  /** Row number / column letter / room label picked a group of cells. */
  onQuickSelect(cells: number[], additive: boolean): void;
  onRoomSelect(room: number): void;
  onPromote(person: PersonId): void;
  /** Take a placed person off the board (the ✕ on their token). */
  onRemove(person: PersonId): void;
  /** Drop a pencil guess (the ✕ on a tentative token). */
  onRemoveTentative(person: PersonId): void;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** 1..9 from a key event; uses `code` so Shift+digit still works on any layout. */
function digitOf(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? '') ?? /^([1-9])$/.exec(e.key);
  return m ? Number(m[1]) : null;
}

interface DragState {
  visited: Set<number>;
  moved: boolean;
  additive: boolean;
  base: number[];
}

export function Board(p: BoardProps) {
  const { puzzle, annotations } = p;
  const vis = annotations.layerVisibility;
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const labelCells = useMemo(() => firstCellOfRooms(puzzle.roomOf), [puzzle.roomOf]);
  const people = useMemo(() => new Map(puzzle.people.map((x) => [x.id, x])), [puzzle.people]);
  const order = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);

  const occupantAt = new Map<number, PersonId>();
  for (const [id, key] of Object.entries(p.placements))
    if (key != null) occupantAt.set(key, Number(id));

  const tentativeAt = new Map<number, Person[]>();
  if (vis.tentative)
    for (const [id, key] of Object.entries(p.tentative)) {
      const person = people.get(Number(id));
      if (key != null && person) tentativeAt.set(key, [...(tentativeAt.get(key) ?? []), person]);
    }

  // Derived (never stored) auto-crosses: rest of the row and column of every placed person.
  const crossed = new Set<number>();
  if (p.autoCross && vis.crosses)
    for (const key of occupantAt.keys()) {
      const r = Math.floor(key / GRID_SIZE);
      const c = key % GRID_SIZE;
      for (let i = 0; i < GRID_SIZE; i++) {
        crossed.add(cellKey(r, i));
        crossed.add(cellKey(i, c));
      }
    }
  for (const key of occupantAt.keys()) crossed.delete(key);

  const focusCell = (r: number, c: number) => {
    p.onCursor(r, c);
    gridRef.current?.querySelector<HTMLElement>(`[data-testid="cell-${r}-${c}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // The focused cell is the truth for key presses; fall back to the tracked cursor.
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    const { r, c } = el ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : p.cursor;
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      const nr = Math.min(GRID_SIZE - 1, Math.max(0, r + arrow[0]));
      const nc = Math.min(GRID_SIZE - 1, Math.max(0, c + arrow[1]));
      focusCell(nr, nc);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Enter places; Space notes a candidate (the keyboard's "quick tap").
      p.onActivate(r, c, { keyboard: true, note: e.key === ' ' });
    } else if (e.key === 'Escape') {
      p.onSelectPerson(null);
    } else {
      const digit = digitOf(e);
      const person = digit ? order[digit - 1] : undefined;
      if (!person) return;
      if (p.tool === 'eliminate') p.onCandidateKey(person.id, true, { r, c });
      else p.onSelectPerson(person.id);
    }
  };

  // ---- drag multi-select (pointer events: mouse, touch and pen)
  const cellAt = (e: PointerEvent): number | null => {
    const hit =
      typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(e.clientX, e.clientY)
        : null;
    const el =
      hit?.closest<HTMLElement>('[data-r]') ??
      (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-r]');
    return el ? cellKey(Number(el.dataset.r), Number(el.dataset.c)) : null;
  };
  // ---- press-and-hold to place (Place mode with a person picked); a quick tap notes instead
  const hold = useRef<{ timer: number; el: HTMLElement; key: number } | null>(null);
  /** When the last hold fired: the touch contextmenu that follows it must not cross the cell. */
  const holdFiredAt = useRef(0);
  /**
   * Set when a hold fires: the click that ends that same press must not also note a candidate.
   * Cleared by the next press, so it never eats a later click (no timers involved).
   */
  const holdClick = useRef(false);
  const cancelHold = () => {
    const h = hold.current;
    if (!h) return;
    window.clearTimeout(h.timer);
    delete h.el.dataset.holding;
    hold.current = null;
  };
  useEffect(() => cancelHold, []);
  const candidateArgs = (key: number) => ({
    puzzle,
    key,
    yes: annotations.candidates[key]?.yes,
    candidatesVisible: vis.candidates,
    placements: p.placements,
  });
  const startHold = (e: PointerEvent, key: number) => {
    cancelHold();
    // (Taps that reach a cell under a locked draw layer act as Place.)
    const placing = p.tool === 'place' || p.tool === 'draw';
    if (!placing || p.solved || e.shiftKey) return;
    // Nobody picked: holding arms only on an empty cell with noted, unplaced people.
    if (p.selectedPerson === null && !holdCandidates(candidateArgs(key)).length) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!el) return;
    el.dataset.holding = 'true';
    const r = Math.floor(key / GRID_SIZE);
    const c = key % GRID_SIZE;
    hold.current = {
      el,
      key,
      timer: window.setTimeout(() => {
        cancelHold();
        holdFiredAt.current = Date.now();
        holdClick.current = true;
        p.onActivate(r, c, { hold: true });
      }, HOLD_MS),
    };
  };
  const { onContextMenu: onCross } = p;
  const onContextMenu = useCallback(
    (r: number, c: number) => {
      // A touch long press also raises contextmenu: it belongs to the hold, not the cross mark.
      if (hold.current || Date.now() - holdFiredAt.current < 1000) return;
      onCross(r, c);
    },
    [onCross],
  );

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const key = cellAt(e);
    if (key === null) return;
    holdClick.current = false;
    startHold(e, key);
    drag.current = {
      visited: new Set([key]),
      moved: false,
      additive: e.shiftKey,
      base: e.shiftKey ? [...p.selection] : [],
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const key = cellAt(e);
    if (key === null || d.visited.has(key)) return;
    cancelHold(); // moved onto another cell: a drag, not a hold
    d.visited.add(key);
    d.moved = true;
    p.onDragSelect([...new Set([...d.base, ...d.visited])], d.additive);
  };
  useEffect(() => {
    const end = () => {
      if (hold.current) {
        window.clearTimeout(hold.current.timer);
        delete hold.current.el.dataset.holding;
        hold.current = null;
      }
      if (drag.current?.moved) {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
      }
      drag.current = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const matches = (r: number, c: number) => {
    const h = p.highlight;
    if (!h || h.kind === 'person') return false;
    return h.kind === 'room' ? puzzle.roomOf[r]![c] === h.id : puzzle.furniture[r]![c] === h.id;
  };

  // Where the hovered person card sits on the board: placed, pencilled in, or noted.
  const personMark = (key: number): PersonMark | undefined => {
    const h = p.highlight;
    if (h?.kind !== 'person') return undefined;
    if (p.placements[h.id] === key) return 'placed';
    if (vis.tentative && p.tentative[h.id] === key) return 'tentative';
    const slot = order.findIndex((x) => x.id === h.id);
    const m = annotations.candidates[key];
    if (vis.candidates && m && slot >= 0 && m.yes & (1 << slot)) return 'candidate';
    return undefined;
  };

  const annFor = (key: number): CellAnn => {
    const m = annotations.candidates[key];
    const personAt = (mask: number) =>
      order.flatMap((person, slot) => (mask & (1 << slot) ? [person.id] : []));
    return {
      mark: vis.crosses ? annotations.cellMarks[key] : undefined,
      color: vis.highlights ? annotations.highlights[key] : undefined,
      inSelection: p.selection.has(key),
      candidates: vis.candidates && m ? personAt(m.yes) : [],
      eliminated: vis.candidates && m ? personAt(m.no) : [],
      tentative: (tentativeAt.get(key) ?? []).map((x) => x.id),
    };
  };

  const candidateViews = (key: number): CandidateView[] => {
    const m = annotations.candidates[key];
    if (!vis.candidates || !m || occupantAt.has(key)) return [];
    return order.flatMap<CandidateView>((person, slot) =>
      m.yes & (1 << slot)
        ? [{ person, slot, state: 'yes' as const }]
        : m.no & (1 << slot)
          ? [{ person, slot, state: 'no' as const }]
          : [],
    );
  };

  const { pick, onPickClose } = p;
  const closePick = useCallback(
    (refocus: boolean) => {
      onPickClose?.();
      if (refocus && pick)
        gridRef.current
          ?.querySelector<HTMLElement>(
            `[data-testid="cell-${Math.floor(pick.key / GRID_SIZE)}-${pick.key % GRID_SIZE}"]`,
          )
          ?.focus();
    },
    [onPickClose, pick],
  );
  const additive = (e: { shiftKey: boolean }) => e.shiftKey;
  const removePerson = (person: Person) => p.onRemove(person.id);

  return (
    <div
      className={styles.frame}
      data-testid="board"
      data-tool={p.tool}
      data-solved={p.solved ? 'true' : undefined}
      data-whatif={p.whatIfLevel ? p.whatIfLevel : undefined}
    >
      <div className={styles.corner} aria-hidden="true" />
      <div className={styles.colLabels} role="group" aria-label="Columns">
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <button
            type="button"
            key={c}
            className={styles.edgeLabel}
            data-testid={`col-label-${c}`}
            title={`Select column ${COLUMN_LETTERS[c]} (Shift adds)`}
            aria-label={`Select column ${COLUMN_LETTERS[c]}`}
            onClick={(e) => p.onQuickSelect(colCells(c), additive(e))}
          >
            {COLUMN_LETTERS[c]}
          </button>
        ))}
      </div>
      <div className={styles.rowLabels} role="group" aria-label="Rows">
        {Array.from({ length: GRID_SIZE }, (_, r) => (
          <button
            type="button"
            key={r}
            className={styles.edgeLabel}
            data-testid={`row-label-${r}`}
            title={`Select row ${r + 1} (Shift adds)`}
            aria-label={`Select row ${r + 1}`}
            onClick={(e) => p.onQuickSelect(rowCells(r), additive(e))}
          >
            {r + 1}
          </button>
        ))}
      </div>
      <div
        ref={gridRef}
        className={`${styles.grid} ${p.tool === 'select' ? styles.selecting : ''}`}
        role="grid"
        aria-label="Murdoku board"
        aria-rowcount={GRID_SIZE}
        aria-colcount={GRID_SIZE}
        aria-readonly={p.solved ? true : undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClickCapture={(e) => {
          // The ✕ buttons on tokens are never the click that ends a hold.
          const onButton = !!(e.target as HTMLElement).closest('button');
          const endsHold = holdClick.current && !onButton;
          if (endsHold) holdClick.current = false;
          if (suppressClick.current || endsHold) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        data-testid="board-grid"
      >
        {Array.from({ length: GRID_SIZE }, (_, r) => (
          <div role="row" className={styles.row} key={r} aria-rowindex={r + 1}>
            {Array.from({ length: GRID_SIZE }, (_, c) => {
              const key = cellKey(r, c);
              const roomId = puzzle.roomOf[r]![c]!;
              const occ = occupantAt.get(key);
              const person = occ !== undefined ? (people.get(occ) ?? null) : null;
              const first = labelCells.get(roomId);
              const ann = annFor(key);
              return (
                <Cell
                  key={c}
                  r={r}
                  c={c}
                  room={puzzle.rooms[roomId]!}
                  color={p.roomColors.get(roomId)!}
                  furniture={puzzle.furniture[r]![c] ?? null}
                  roomLabel={first?.[0] === r && first[1] === c}
                  person={person}
                  conflicts={
                    p.conflictHighlight && occ !== undefined ? (p.conflicts.get(occ) ?? []) : []
                  }
                  autoCross={crossed.has(key)}
                  highlighted={matches(r, c)}
                  personMark={personMark(key)}
                  selected={occ !== undefined && occ === p.selectedPerson}
                  cursor={p.cursor.r === r && p.cursor.c === c}
                  shaking={p.shakeCell === key}
                  dimmed={p.dimmed?.has(key)}
                  possible={p.possible?.has(key)}
                  wrong={occ !== undefined && p.wrongPeople?.has(occ)}
                  removable={!p.solved}
                  onRemove={removePerson}
                  ann={ann}
                  annotations={
                    <CellMarks
                      r={r}
                      c={c}
                      mark={ann.mark}
                      color={ann.color}
                      candidates={candidateViews(key)}
                      tentative={tentativeAt.get(key) ?? []}
                      onPromote={(person) => p.onPromote(person.id)}
                      onRemove={p.solved ? undefined : (person) => p.onRemoveTentative(person.id)}
                    />
                  }
                  onActivate={p.onActivate}
                  onContextMenu={onContextMenu}
                  onRoomLabelDouble={p.onRoomSelect}
                  onFocusCell={p.onCursor}
                />
              );
            })}
          </div>
        ))}
      </div>
      <WallLayer roomOf={puzzle.roomOf} />
      {p.pick && (
        <RadialPick
          key={p.pick.key}
          cellKey={p.pick.key}
          people={p.pick.people.flatMap((id) => people.get(id) ?? [])}
          onPick={(id) => p.onPick?.(id)}
          onClose={closePick}
        />
      )}
      <DrawingLayer strokes={annotations.strokes} visible={vis.drawing} {...p.draw} />
    </div>
  );
}
