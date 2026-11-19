import type { CSSProperties } from 'react';
import type { ColorId, MarkKind } from '../state/annotations';
import type { Person } from '../engine/types';
import styles from './Annotations.module.css';
import { COLOR_INFO } from './colors';

export interface CandidateView {
  person: Person;
  /** Fixed slot 0..8 = position in the people panel. */
  slot: number;
  state: 'yes' | 'no';
}

export interface CellMarksProps {
  r: number;
  c: number;
  mark?: MarkKind;
  color?: ColorId;
  candidates: readonly CandidateView[];
  tentative: readonly Person[];
  onPromote(person: Person): void;
  /** Drop a pencil guess; no ✕ is shown without it. */
  onRemove?(person: Person): void;
}

const MARK_LABEL: Record<MarkKind, string> = {
  cross: 'Nobody here',
  dot: 'Someone could be here',
  unsure: 'Unsure',
};

/** Visuals the annotation toolkit draws inside a board cell. */
export function CellMarks(p: CellMarksProps) {
  return (
    <>
      {p.color && (
        <span
          className={styles.hl}
          data-color={p.color}
          data-testid={`hl-${p.r}-${p.c}`}
          aria-hidden="true"
        >
          <span className={styles.glyph}>{COLOR_INFO[p.color].glyph}</span>
        </span>
      )}
      {p.mark === 'cross' && (
        <svg
          className={styles.cross}
          viewBox="0 0 10 10"
          role="img"
          aria-label={MARK_LABEL.cross}
          data-testid={`mark-${p.r}-${p.c}`}
        >
          <path d="M1.8 1.8l6.4 6.4M8.2 1.8l-6.4 6.4" />
        </svg>
      )}
      {p.mark === 'dot' && (
        <span
          className={styles.dot}
          role="img"
          aria-label={MARK_LABEL.dot}
          data-testid={`mark-${p.r}-${p.c}`}
        />
      )}
      {p.mark === 'unsure' && (
        <span
          className={styles.unsure}
          role="img"
          aria-label={MARK_LABEL.unsure}
          data-testid={`mark-${p.r}-${p.c}`}
        >
          ?
        </span>
      )}
      {p.candidates.length > 0 && (
        <span className={styles.cands} data-testid={`cands-${p.r}-${p.c}`}>
          {p.candidates.map((cd) => (
            <span
              key={cd.person.id}
              className={styles.cand}
              style={{ gridRow: Math.floor(cd.slot / 3) + 1, gridColumn: (cd.slot % 3) + 1 }}
              data-state={cd.state}
              data-testid={`cand-${p.r}-${p.c}-${cd.person.id}`}
              title={`${cd.person.name}${cd.state === 'no' ? ' is not here' : ' might be here'}`}
            >
              {cd.person.initial}
            </span>
          ))}
        </span>
      )}
      {p.tentative.map((person) => (
        <span
          key={person.id}
          className={styles.tentative}
          style={{ '--tc': person.color } as CSSProperties}
          data-testid={`tentative-${person.id}`}
        >
          <span className={styles.tentInitial}>{person.initial}</span>
          <button
            type="button"
            className={styles.promote}
            data-testid={`promote-${person.id}`}
            title={`Place ${person.name} here for real`}
            aria-label={`Place ${person.name} here for real`}
            onClick={(e) => {
              e.stopPropagation();
              p.onPromote(person);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ✓
          </button>
          {p.onRemove && (
            <button
              type="button"
              className={`${styles.promote} ${styles.dropGuess}`}
              data-testid={`untentative-${person.id}`}
              title={`Remove the guess for ${person.name}`}
              aria-label={`Remove the guess for ${person.name}`}
              onClick={(e) => {
                e.stopPropagation();
                p.onRemove?.(person);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ✕
            </button>
          )}
        </span>
      ))}
    </>
  );
}
