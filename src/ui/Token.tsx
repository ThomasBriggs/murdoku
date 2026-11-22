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
  cssInitial = false,
}: {
  person: Person;
  conflict?: boolean;
  /** Flagged wrong by a check: an icon badge, never colour alone. */
  wrong?: boolean;
  describedBy?: string;
  /** Prefix for test ids so the board and the panel can both show a token. */
  scope?: string;
  /** Draw the initial with CSS content (cells: keeps it out of the text axe compares to the label). */
  cssInitial?: boolean;
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
      <span
        className={`${styles.initial} ${cssInitial ? styles.cssInitial : ''}`}
        aria-hidden="true"
        data-initial={cssInitial ? person.initial : undefined}
      >
        {cssInitial ? null : person.initial}
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
