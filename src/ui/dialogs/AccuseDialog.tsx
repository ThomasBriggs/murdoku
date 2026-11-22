import { useState } from 'react';
import type { Person, PersonId } from '../../engine/types';
import { Modal } from '../ConfirmDialog';
import { Token } from '../Token';
import styles from './Dialogs.module.css';

export const ACCUSE_WRONG_PLACEMENT = "Your placement isn't right yet.";
export const ACCUSE_WRONG_SUSPECT =
  "Everyone is in the right place, but that's not the murderer — think about who shares the victim's room.";
export const ACCUSE_NOT_ALONE =
  'The victim was alone with exactly one other person. Check your placements: right now';

export interface AccuseDialogProps {
  /** The victim, as placed by the player. */
  victim: Person;
  /**
   * Everyone the player has placed in the victim's room (never the victim). By the rules the
   * murderer is the only other person there, so exactly one means there is nobody to choose.
   */
  roommates: readonly Person[];
  /** Resolves to the verdict to show, or 'won' (the parent closes the dialog). */
  onAccuse(suspect: PersonId): Promise<'placement' | 'suspect' | 'won' | 'error'>;
  onClose(): void;
}

/** "A, B and C". */
function listNames(people: readonly Person[]): string {
  const names = people.map((x) => x.name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "Are you sure?" for the one suspect the board allows: whoever is alone with the victim. */
export function AccuseDialog(p: AccuseDialogProps) {
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'placement' | 'suspect' | 'error' | null>(null);
  const suspect = p.roommates.length === 1 ? p.roommates[0]! : null;

  const submit = async () => {
    if (!suspect) return;
    setBusy(true);
    const r = await p.onAccuse(suspect.id);
    setBusy(false);
    if (r !== 'won') setVerdict(r);
  };

  return (
    <Modal
      title={suspect ? 'Accuse the murderer?' : 'Nobody to accuse yet'}
      testId="accuse-dialog"
      onCancel={p.onClose}
      actions={
        suspect ? (
          <>
            <button type="button" data-testid="accuse-cancel" onClick={p.onClose}>
              Not yet
            </button>
            <button
              type="button"
              className={styles.primary}
              data-testid="accuse-confirm"
              disabled={busy}
              onClick={() => void submit()}
            >
              Accuse {suspect.name}
            </button>
          </>
        ) : (
          <button type="button" data-testid="accuse-cancel" onClick={p.onClose}>
            Back to the board
          </button>
        )
      }
    >
      {suspect ? (
        <>
          <div className={styles.accused} data-testid="accuse-suspect" data-person={suspect.id}>
            <span className={styles.accusedTok}>
              <Token person={suspect} scope="accuse-" />
            </span>
            <span>
              <strong>{suspect.name}</strong> was alone in the room with {p.victim.name}.
            </span>
          </div>
          <p className={styles.muted}>
            Are you sure {suspect.name} is the murderer? A wrong accusation does not end the game.
          </p>
        </>
      ) : (
        <p data-testid="accuse-not-alone">
          {ACCUSE_NOT_ALONE}{' '}
          {p.roommates.length === 0
            ? `nobody else is in ${p.victim.name}'s room.`
            : `${listNames(p.roommates)} are all in ${p.victim.name}'s room.`}
        </p>
      )}
      {verdict && (
        <p
          className={styles.result}
          role="alert"
          data-testid="accuse-result"
          data-verdict={verdict}
        >
          {verdict === 'placement' && ACCUSE_WRONG_PLACEMENT}
          {verdict === 'suspect' && ACCUSE_WRONG_SUSPECT}
          {verdict === 'error' && 'Something went wrong checking your accusation. Try again.'}
        </p>
      )}
    </Modal>
  );
}
