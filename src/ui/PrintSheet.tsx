import { useMemo } from 'react';
import { renderClue } from '../engine/clues/render';
import { GRID_SIZE } from '../engine/constants';
import { FURNITURE } from '../engine/furniture';
import { cellKey, type FurnitureType, type PersonId, type PuzzleView } from '../engine/types';
import type { Annotations } from '../state/annotations';
import { FurnitureIcon } from './icons/FurnitureIcon';
import './print.css';
import { COLUMN_LETTERS, panelOrder } from './types';
import { computeWalls, firstCellOfRooms } from './walls';

export interface PrintSheetProps {
  puzzle: PuzzleView;
  placements: Record<PersonId, number | null>;
  annotations: Annotations;
  /** Include the player's placements, marks, candidates and margin notes; otherwise a blank sheet. */
  includeMarks: boolean;
}

const MARK_GLYPH = { cross: '✗', dot: '•', unsure: '?' } as const;

/**
 * Black-and-white, single-page rendering of the puzzle (SPEC §6.5.10). It is
 * always in the DOM but `display: none` on screen; print.css shows it (and
 * hides everything else) under `@media print`.
 */
export function PrintSheet({ puzzle, placements, annotations, includeMarks }: PrintSheetProps) {
  const walls = useMemo(() => computeWalls(puzzle.roomOf), [puzzle.roomOf]);
  const labelCells = useMemo(() => firstCellOfRooms(puzzle.roomOf), [puzzle.roomOf]);
  const order = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);
  const ctx = useMemo(() => ({ rooms: puzzle.rooms, people: puzzle.people }), [puzzle]);
  const clues = useMemo(
    () => new Map(puzzle.clues.map((c) => [c.person, renderClue(ctx, c).text])),
    [puzzle.clues, ctx],
  );
  const occupant = new Map<number, (typeof order)[number]>();
  if (includeMarks)
    for (const p of order) {
      const k = placements[p.id];
      if (k != null) occupant.set(k, p);
    }
  const furnTypes = [
    ...new Set(puzzle.furniture.flat().filter((f): f is FurnitureType => f !== null)),
  ].sort();

  return (
    <div
      className="print-sheet"
      data-testid="print-sheet"
      data-marks={includeMarks ? 'true' : 'false'}
    >
      <h1>Murdoku</h1>
      <p className="ps-meta">
        Seed {puzzle.seed} &middot; {puzzle.difficulty}. Put each of the nine people in a cell:
        exactly one per row and column, and satisfy every clue.
      </p>
      <div className={`ps-frame ${includeMarks ? 'ps-with-notes' : ''}`}>
        <div className="ps-collabels">
          {Array.from({ length: GRID_SIZE }, (_, c) => (
            <span key={c}>{COLUMN_LETTERS[c]}</span>
          ))}
        </div>
        <div className="ps-rowlabels">
          {Array.from({ length: GRID_SIZE }, (_, r) => (
            <span key={r}>{r + 1}</span>
          ))}
        </div>
        <div className="ps-grid">
          {Array.from({ length: GRID_SIZE }, (_, r) =>
            Array.from({ length: GRID_SIZE }, (_, c) => {
              const key = cellKey(r, c);
              const w = walls[r]![c]!;
              const roomId = puzzle.roomOf[r]![c]!;
              const first = labelCells.get(roomId);
              const f = puzzle.furniture[r]![c];
              const person = occupant.get(key);
              const mark = includeMarks ? annotations.cellMarks[key] : undefined;
              const cand = includeMarks && !person ? annotations.candidates[key] : undefined;
              const roomNote = includeMarks ? annotations.roomNotes[roomId] : undefined;
              return (
                <div
                  key={key}
                  className={[
                    'ps-cell',
                    w.top && 'ps-t',
                    w.left && 'ps-l',
                    w.right && 'ps-r',
                    w.bottom && 'ps-b',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {first?.[0] === r && first[1] === c && (
                    <span className="ps-room">
                      {puzzle.rooms[roomId]!.name}
                      {roomNote ? ` (${roomNote})` : ''}
                    </span>
                  )}
                  {f && (
                    <span className="ps-furn">
                      <FurnitureIcon type={f} />
                    </span>
                  )}
                  {mark && <span className={`ps-mark ps-${mark}`}>{MARK_GLYPH[mark]}</span>}
                  {cand && (
                    <span className="ps-cands">
                      {order.map((p, slot) =>
                        cand.yes & (1 << slot) ? (
                          <i key={p.id}>{p.initial}</i>
                        ) : cand.no & (1 << slot) ? (
                          <i key={p.id} className="ps-no">
                            {p.initial}
                          </i>
                        ) : null,
                      )}
                    </span>
                  )}
                  {person && <span className="ps-person">{person.initial}</span>}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="ps-lists">
        <section>
          <h2>Rooms</h2>
          <ul>
            {puzzle.rooms.map((room) => (
              <li key={room.id}>{room.name}</li>
            ))}
          </ul>
          <h2>Furniture</h2>
          <ul className="ps-furnlist">
            {furnTypes.map((t) => (
              <li key={t}>
                <span className="ps-furn-s">
                  <FurnitureIcon type={t} />
                </span>
                {FURNITURE[t].label}
                {FURNITURE[t].occupiable ? '' : ' (blocks)'}
              </li>
            ))}
          </ul>
        </section>
        <section className="ps-clues">
          <h2>Clues</h2>
          <ol>
            {order.map((p) => (
              <li key={p.id}>
                <strong>{p.initial}</strong>{' '}
                {clues.get(p.id) ??
                  (p.isVictim
                    ? `${p.name} (the victim) was alone in the room with the murderer.`
                    : p.name)}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
