import { useState } from 'react';
import type { Person, PersonId } from '../../engine/types';
import { Modal } from '../ConfirmDialog';
import { Token } from '../Token';
import styles from './Dialogs.module.css';

export const ACCUSE_WRONG_PLACEMENT = "Your placement isn't right yet.";
export const ACCUSE_WRONG_SUSPECT =
  "Everyone is in the right place, but that's not the murderer — think about who shares the victim's room.";

export interface AccuseDialogProps {
  /** The 8 suspects (never the victim). */
  suspects: readonly Person[];
  /** Resolves to the verdict message to show, or null when the game was won (the parent closes). */
  onAccuse(suspect: PersonId): Promise<'placement' | 'suspect' | 'won' | 'error'>;
  onClose(): void;
}

export function AccuseDialog(p: AccuseDialogProps) {
  const [choice, setChoice] = useState<PersonId | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'placement' | 'suspect' | 'error' | null>(null);

  const submit = async () => {
    if (choice === null) return;
    setBusy(true);
    const r = await p.onAccuse(choice);
    setBusy(false);
    if (r !== 'won') setVerdict(r);
  };

  return (
    <Modal
      title="Accuse a suspect"
      testId="accuse-dialog"
      onCancel={p.onClose}
      wide
      actions={
        <>
          <button type="button" data-testid="accuse-cancel" onClick={p.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            data-testid="accuse-confirm"
            disabled={choice === null || busy}
            onClick={() => void submit()}
          >
            Accuse
          </button>
        </>
      }
    >
      <p className={styles.muted}>Who is the murderer? A wrong accusation does not end the game.</p>
      <ul className={styles.suspects} role="radiogroup" aria-label="Suspects">
        {p.suspects.map((s) => (
          <li key={s.id}>
            <label>
              <input
                type="radio"
                name="suspect"
                data-testid={`accuse-suspect-${s.id}`}
                checked={choice === s.id}
                onChange={() => {
                  setChoice(s.id);
                  setVerdict(null);
                }}
              />
              <span className={styles.tok}>
                <Token person={s} scope="accuse-" />
              </span>
              {s.name}
            </label>
          </li>
        ))}
      </ul>
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
