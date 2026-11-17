import { useMemo } from 'react';
import { renderClue, type ClueToken } from '../engine/clues/render';
import type { FurnitureType, PersonId, PuzzleView, RoomId } from '../engine/types';
import { parseCellKey } from '../engine/types';
import { Token } from './Token';
import styles from './PeoplePanel.module.css';
import { COLUMN_LETTERS, panelOrder, type Highlight } from './types';

export interface PeoplePanelProps {
  puzzle: PuzzleView;
  placements: Record<PersonId, number | null>;
  selectedPerson: PersonId | null;
  onSelect(id: PersonId | null): void;
  onHighlight(h: Highlight | null): void;
}

function ClueText({
  tokens,
  onHighlight,
}: {
  tokens: ClueToken[];
  onHighlight: (h: Highlight | null) => void;
}) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'room' || t.kind === 'furniture') {
          const h: Highlight =
            t.kind === 'room'
              ? { kind: 'room', id: t.ref as RoomId }
              : { kind: 'furniture', id: t.ref as FurnitureType };
          return (
            <span
              key={i}
              className={t.kind === 'room' ? styles.roomWord : styles.furnWord}
              tabIndex={0}
              data-testid={`clue-${t.kind}-${t.ref}`}
              onMouseEnter={() => onHighlight(h)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(h)}
              onBlur={() => onHighlight(null)}
            >
              {t.text}
            </span>
          );
        }
        return t.kind === 'person' ? (
          <strong key={i}>{t.text}</strong>
        ) : (
          <span key={i}>{t.text}</span>
        );
      })}
    </>
  );
}

export function PeoplePanel({
  puzzle,
  placements,
  selectedPerson,
  onSelect,
  onHighlight,
}: PeoplePanelProps) {
  const ctx = useMemo(() => ({ rooms: puzzle.rooms, people: puzzle.people }), [puzzle]);
  const people = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);
  const clueOf = useMemo(() => {
    const m = new Map<PersonId, ClueToken[]>();
    for (const c of puzzle.clues) m.set(c.person, renderClue(ctx, c).tokens);
    return m;
  }, [puzzle.clues, ctx]);

  return (
    <section className={styles.panel} aria-label="People" data-testid="people-panel">
      <ol className={styles.list}>
        {people.map((person, i) => {
          const cell = placements[person.id];
          const where = cell != null ? parseCellKey(cell) : null;
          const selected = selectedPerson === person.id;
          const tokens = clueOf.get(person.id);
          return (
            <li
              key={person.id}
              className={`${styles.card} ${selected ? styles.selected : ''}`}
              data-testid={`person-card-${person.id}`}
              data-selected={selected ? 'true' : 'false'}
              data-placed={where ? 'true' : 'false'}
              onClick={() => onSelect(selected ? null : person.id)}
            >
              <button
                type="button"
                className={styles.head}
                aria-pressed={selected}
                aria-keyshortcuts={String(i + 1)}
              >
                <span className={styles.tokenBox}>
                  <Token person={person} scope="card-" />
                </span>
                <span className={styles.name}>
                  {person.name}
                  {person.isVictim && <span className={styles.victimTag}>Victim</span>}
                </span>
                <span className={styles.status} data-testid={`person-status-${person.id}`}>
                  {where ? `Placed ${COLUMN_LETTERS[where.c]}${where.r + 1}` : 'Unplaced'}
                </span>
              </button>
              <p className={styles.clue} data-testid={`person-clue-${person.id}`}>
                {tokens ? (
                  <ClueText tokens={tokens} onHighlight={onHighlight} />
                ) : person.isVictim ? (
                  'The victim. Only the murderer shared a room with them.'
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
