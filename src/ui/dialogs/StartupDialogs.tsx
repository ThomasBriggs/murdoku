import type { Difficulty } from '../../engine/types';
import { Modal } from '../ConfirmDialog';
import styles from './Dialogs.module.css';

/** A shared link was opened while a different game is in progress. */
export function ChooseGameDialog(p: {
  sharedSeed: string;
  sharedDifficulty: Difficulty;
  onContinue(): void;
  onShared(): void;
}) {
  return (
    <Modal
      title="Continue or start the shared puzzle?"
      testId="startup-choose"
      onCancel={p.onContinue}
      initialFocus="actions"
      actions={
        <>
          <button type="button" data-testid="startup-shared" onClick={p.onShared}>
            Start the shared puzzle
          </button>
          <button
            type="button"
            className={styles.primary}
            data-autofocus
            data-testid="startup-continue"
            onClick={p.onContinue}
          >
            Continue my saved game
          </button>
        </>
      }
    >
      <p>
        You have a saved game with progress, and this link opens a different puzzle (
        <code>{p.sharedSeed}</code>, {p.sharedDifficulty}).
      </p>
      <p className={styles.muted}>Starting the shared puzzle discards your saved game.</p>
    </Modal>
  );
}

/** The saved game was made by an older puzzle generator and cannot be restored. */
export function OutdatedSaveDialog({ onStart }: { onStart(): void }) {
  return (
    <Modal
      title="Your saved game is out of date"
      testId="startup-outdated"
      onCancel={onStart}
      initialFocus="actions"
      actions={
        <button
          type="button"
          className={styles.primary}
          data-testid="startup-outdated-new"
          onClick={onStart}
        >
          Start a new game
        </button>
      }
    >
      <p>
        The puzzle generator was updated, so the same seed now makes a different puzzle and your
        saved progress no longer fits. Starting a new game discards the old save.
      </p>
    </Modal>
  );
}
