import { useMemo, useRef, type KeyboardEvent } from 'react';
import { GRID_SIZE } from '../engine/constants';
import { cellKey, type PersonId, type PuzzleView } from '../engine/types';
import styles from './Board.module.css';
import { Cell } from './Cell';
import type { RoomColor } from './roomColors';
import { COLUMN_LETTERS, panelOrder, type Highlight } from './types';
import { computeWalls, firstCellOfRooms } from './walls';

export interface BoardProps {
  puzzle: PuzzleView;
  roomColors: Map<number, RoomColor>;
  placements: Record<PersonId, number | null>;
  selectedPerson: PersonId | null;
  cursor: { r: number; c: number };
  highlight: Highlight | null;
  conflicts: Map<PersonId, string[]>;
  autoCross: boolean;
  conflictHighlight: boolean;
  shakeCell: number | null;
  onCursor(r: number, c: number): void;
  onActivate(r: number, c: number): void;
  onSelectPerson(id: PersonId | null): void;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function Board(p: BoardProps) {
  const { puzzle } = p;
  const gridRef = useRef<HTMLDivElement>(null);
  const walls = useMemo(() => computeWalls(puzzle.roomOf), [puzzle.roomOf]);
  const labelCells = useMemo(() => firstCellOfRooms(puzzle.roomOf), [puzzle.roomOf]);
  const people = useMemo(() => new Map(puzzle.people.map((x) => [x.id, x])), [puzzle.people]);
  const order = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);

  const occupantAt = new Map<number, PersonId>();
  for (const [id, key] of Object.entries(p.placements))
    if (key != null) occupantAt.set(key, Number(id));

  // Derived (never stored) auto-crosses: rest of the row and column of every placed person.
  const crossed = new Set<number>();
  if (p.autoCross)
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
    const { r, c } = p.cursor;
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      const nr = Math.min(GRID_SIZE - 1, Math.max(0, r + arrow[0]));
      const nc = Math.min(GRID_SIZE - 1, Math.max(0, c + arrow[1]));
      focusCell(nr, nc);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      p.onActivate(r, c);
    } else if (e.key === 'Escape') {
      p.onSelectPerson(null);
    } else if (/^[1-9]$/.test(e.key)) {
      const person = order[Number(e.key) - 1];
      if (person) p.onSelectPerson(person.id);
    }
  };

  const matches = (r: number, c: number) => {
    const h = p.highlight;
    if (!h) return false;
    return h.kind === 'room' ? puzzle.roomOf[r]![c] === h.id : puzzle.furniture[r]![c] === h.id;
  };

  return (
    <div className={styles.frame} data-testid="board">
      <div className={styles.corner} aria-hidden="true" />
      <div className={styles.colLabels} aria-hidden="true">
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <span key={c}>{COLUMN_LETTERS[c]}</span>
        ))}
      </div>
      <div className={styles.rowLabels} aria-hidden="true">
        {Array.from({ length: GRID_SIZE }, (_, r) => (
          <span key={r}>{r + 1}</span>
        ))}
      </div>
      <div
        ref={gridRef}
        className={styles.grid}
        role="grid"
        aria-label="Murdoku board"
        aria-rowcount={GRID_SIZE}
        aria-colcount={GRID_SIZE}
        onKeyDown={onKeyDown}
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
                  person={person}
                  conflicts={
                    p.conflictHighlight && occ !== undefined ? (p.conflicts.get(occ) ?? []) : []
                  }
                  autoCross={crossed.has(key)}
                  highlighted={matches(r, c)}
                  selected={occ !== undefined && occ === p.selectedPerson}
                  cursor={p.cursor.r === r && p.cursor.c === c}
                  shaking={p.shakeCell === key}
                  onActivate={p.onActivate}
                  onFocusCell={p.onCursor}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
