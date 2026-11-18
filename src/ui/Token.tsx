import type { Person } from '../engine/types';
import { DaggerIcon, WarningIcon, WrongIcon } from './icons/glyphs';
import styles from './Token.module.css';

/** Coloured circle with the person's initial; sizes itself to its container. */
export function Token({
  person,
  conflict = false,
  wrong = false,
  describedBy,
  scope = '',
}: {
  person: Person;
  conflict?: boolean;
  /** Flagged wrong by a check or hint: an icon badge, never colour alone. */
  wrong?: boolean;
  describedBy?: string;
  /** Prefix for test ids so the board and the panel can both show a token. */
  scope?: string;
}) {
  return (
    <span
      className={`${styles.token} ${conflict || wrong ? styles.conflict : ''}`}
      style={{ background: person.color }}
      data-testid={`${scope}token-${person.id}`}
      data-victim={person.isVictim ? 'true' : undefined}
      data-conflict={conflict ? 'true' : undefined}
      data-wrong={wrong ? 'true' : undefined}
      aria-describedby={describedBy}
    >
      <span className={styles.initial} aria-hidden="true">
        {person.initial}
      </span>
      {person.isVictim && (
        <span
          className={`${styles.badge} ${styles.victim}`}
          data-testid={`${scope}victim-badge-${person.id}`}
        >
          <DaggerIcon />
        </span>
      )}
      {wrong && (
        <span
          className={`${styles.badge} ${styles.warn}`}
          data-testid={`${scope}wrong-badge-${person.id}`}
          title="Not in the right place"
        >
          <WrongIcon />
        </span>
      )}
      {conflict && !wrong && (
        <span
          className={`${styles.badge} ${styles.warn}`}
          data-testid={`${scope}conflict-badge-${person.id}`}
        >
          <WarningIcon />
        </span>
      )}
    </span>
  );
}
