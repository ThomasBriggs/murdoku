import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { PersonId, PuzzleView } from '../engine/types';
import type { Annotations, LogicTable, Mark3 } from '../state/annotations';
import type { RoomColor } from './roomColors';
import styles from './Solving.module.css';
import { COLUMN_LETTERS, panelOrder } from './types';

export interface LogicGridProps {
  puzzle: PuzzleView;
  roomColors: Map<number, RoomColor>;
  grid: Annotations['logicGrid'];
  /** Full-screen sheet (mobile) instead of an inline panel. */
  sheet: boolean;
  onCycle(table: LogicTable, slot: number, index: number): void;
  onClose(): void;
}

const STATE_LABEL: Record<Mark3, string> = { 0: 'blank', 1: 'crossed out', 2: 'ticked' };
const STATE_GLYPH: Record<Mark3, string> = { 0: '', 1: '✗', 2: '✓' };

/** First letters of a room name, for narrow column headers (the full name is the tooltip). */
export function abbreviateRoom(name: string, max = 4): string {
  return name.length <= max ? name : name.slice(0, max - 1) + '.';
}

interface Col {
  label: string;
  title: string;
  swatch?: RoomColor;
}

/**
 * Deduction matrix (SPEC §6.5.5): People x Rooms / Rows / Columns. Each cell
 * cycles blank, cross, tick. Rows are the people in panel order (the same slot
 * as candidate initials).
 */
export function LogicGrid({ puzzle, roomColors, grid, sheet, onCycle, onClose }: LogicGridProps) {
  const people = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sheet) closeRef.current?.focus();
  }, [sheet]);

  const tables: { id: LogicTable; title: string; cols: Col[] }[] = [
    {
      id: 'rooms',
      title: 'People × Rooms',
      cols: puzzle.rooms.map((r) => ({
        label: abbreviateRoom(r.name),
        title: r.name,
        swatch: roomColors.get(r.id),
      })),
    },
    {
      id: 'rows',
      title: 'People × Rows',
      cols: Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), title: `Row ${i + 1}` })),
    },
    {
      id: 'cols',
      title: 'People × Columns',
      cols: Array.from({ length: 9 }, (_, i) => ({
        label: COLUMN_LETTERS[i]!,
        title: `Column ${COLUMN_LETTERS[i]}`,
      })),
    },
  ];

  const nameOf = (id: PersonId) => puzzle.people.find((p) => p.id === id)?.name ?? '';

  return (
    <section
      className={sheet ? styles.logicSheet : styles.logicPanel}
      aria-label="Logic grid"
      data-testid="logic-grid"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.panelHead}>
        <h2>Logic grid</h2>
        <span className={styles.hint}>Click a cell: ✗, ✓, blank</span>
        <button type="button" ref={closeRef} data-testid="logic-close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className={styles.tables}>
        {tables.map((t) => (
          <table key={t.id} className={styles.logicTable} data-testid={`logic-table-${t.id}`}>
            <caption>{t.title}</caption>
            <thead>
              <tr>
                <td />
                {t.cols.map((c, i) => (
                  <th key={i} scope="col" title={c.title}>
                    {c.swatch && (
                      <span
                        className={styles.roomSwatch}
                        aria-hidden="true"
                        style={
                          { '--room-l': c.swatch.light, '--room-d': c.swatch.dark } as CSSProperties
                        }
                      />
                    )}
                    <span aria-hidden={c.title !== c.label ? 'true' : undefined}>{c.label}</span>
                    {c.title !== c.label && <span className="sr-only">{c.title}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person, slot) => (
                <tr key={person.id}>
                  <th scope="row" className={styles.personHead}>
                    <span
                      className={styles.personDot}
                      style={{ background: person.color }}
                      aria-hidden="true"
                    >
                      {person.initial}
                    </span>
                    <span className={styles.personName}>{person.name}</span>
                  </th>
                  {t.cols.map((c, i) => {
                    const m = (grid[t.id][slot]?.[i] ?? 0) as Mark3;
                    return (
                      <td key={i}>
                        <button
                          type="button"
                          className={styles.logicCell}
                          data-testid={`logic-${t.id}-${slot}-${i}`}
                          data-state={m}
                          aria-label={`${nameOf(person.id)}, ${c.title}: ${STATE_LABEL[m]}`}
                          title={`${nameOf(person.id)} / ${c.title}`}
                          onClick={() => onCycle(t.id, slot, i)}
                        >
                          {STATE_GLYPH[m]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
