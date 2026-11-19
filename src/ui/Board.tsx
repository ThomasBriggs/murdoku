import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { GRID_SIZE } from '../engine/constants';
import { cellKey, type Person, type PersonId, type PuzzleView } from '../engine/types';
import type { Annotations } from '../state/annotations';
import { colCells, rowCells } from '../state/selection';
import type { Tool } from '../state/store';
import styles from './Board.module.css';
import { Cell, type ActivateMods, type CellAnn } from './Cell';
import { CellMarks, type CandidateView } from './CellMarks';
import { DrawingLayer, type DrawingProps } from './DrawingLayer';
import { NoteInput } from './NoteInput';
import type { RoomColor } from './roomColors';
import { COLUMN_LETTERS, panelOrder, type Highlight } from './types';
import { computeWalls, firstCellOfRooms } from './walls';

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
  /** Hint highlights (cleared by the parent when dismissed). */
  hintCells?: { target: ReadonlySet<number>; involved: ReadonlySet<number> };
  /** People whose token is flagged wrong (check / hint). */
  wrongPeople?: ReadonlySet<PersonId>;
  /** The puzzle is solved: the board is view-only. */
  solved?: boolean;
  /** Open what-if depth (0 = none); tints the board. */
  whatIfLevel?: number;
  draw: Omit<DrawingProps, 'strokes' | 'visible'>;
  onCursor(r: number, c: number): void;
  onActivate(r: number, c: number, mods?: ActivateMods): void;
  onContextMenu(r: number, c: number): void;
  onSelectPerson(id: PersonId | null): void;
  /** Number key in notes mode: toggle that person's candidate (or eliminate). */
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
  onNote(kind: 'row' | 'col', index: number, text: string): void;
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
  const walls = useMemo(() => computeWalls(puzzle.roomOf), [puzzle.roomOf]);
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
      p.onActivate(r, c, { keyboard: true });
    } else if (e.key === 'Escape') {
      p.onSelectPerson(null);
    } else {
      const digit = digitOf(e);
      const person = digit ? order[digit - 1] : undefined;
      if (!person) return;
      if (p.tool === 'notes' || p.tool === 'eliminate')
        p.onCandidateKey(person.id, e.shiftKey || p.tool === 'eliminate', { r, c });
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
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const key = cellAt(e);
    if (key === null) return;
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
    d.visited.add(key);
    d.moved = true;
    p.onDragSelect([...new Set([...d.base, ...d.visited])], d.additive);
  };
  useEffect(() => {
    const end = () => {
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
    if (!h) return false;
    return h.kind === 'room' ? puzzle.roomOf[r]![c] === h.id : puzzle.furniture[r]![c] === h.id;
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

  const additive = (e: { shiftKey: boolean }) => e.shiftKey;
  const removePerson = (person: Person) => p.onRemove(person.id);

  return (
    <div
      className={`${styles.frame} ${vis.margins ? '' : styles.noMargins}`}
      data-testid="board"
      data-tool={p.tool}
      data-solved={p.solved ? 'true' : undefined}
      data-whatif={p.whatIfLevel ? p.whatIfLevel : undefined}
    >
      <div className={styles.colNotes} data-testid="col-notes">
        {vis.margins &&
          Array.from({ length: GRID_SIZE }, (_, c) => (
            <NoteInput
              key={c}
              className={styles.note}
              value={annotations.colNotes[c] ?? ''}
              label={`Column ${COLUMN_LETTERS[c]} note`}
              testId={`col-note-${c}`}
              onCommit={(t) => p.onNote('col', c, t)}
            />
          ))}
      </div>
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
          if (suppressClick.current) {
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
                  walls={walls[r]![c]!}
                  roomLabel={first?.[0] === r && first[1] === c}
                  roomNote={vis.margins ? annotations.roomNotes[roomId] : undefined}
                  person={person}
                  conflicts={
                    p.conflictHighlight && occ !== undefined ? (p.conflicts.get(occ) ?? []) : []
                  }
                  autoCross={crossed.has(key)}
                  highlighted={matches(r, c)}
                  selected={occ !== undefined && occ === p.selectedPerson}
                  cursor={p.cursor.r === r && p.cursor.c === c}
                  shaking={p.shakeCell === key}
                  dimmed={p.dimmed?.has(key)}
                  possible={p.possible?.has(key)}
                  hint={
                    p.hintCells?.target.has(key)
                      ? 'target'
                      : p.hintCells?.involved.has(key)
                        ? 'involved'
                        : undefined
                  }
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
                  onContextMenu={p.onContextMenu}
                  onRoomLabelDouble={p.onRoomSelect}
                  onFocusCell={p.onCursor}
                />
              );
            })}
          </div>
        ))}
      </div>
      <DrawingLayer strokes={annotations.strokes} visible={vis.drawing} {...p.draw} />
      <div className={styles.rowNotes} data-testid="row-notes">
        {vis.margins &&
          Array.from({ length: GRID_SIZE }, (_, r) => (
            <NoteInput
              key={r}
              className={styles.note}
              value={annotations.rowNotes[r] ?? ''}
              label={`Row ${r + 1} note`}
              testId={`row-note-${r}`}
              onCommit={(t) => p.onNote('row', r, t)}
            />
          ))}
      </div>
    </div>
  );
}
