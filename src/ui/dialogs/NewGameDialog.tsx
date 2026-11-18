import { useState } from 'react';
import type { Difficulty } from '../../engine/types';
import { Modal } from '../ConfirmDialog';
import { useGame, useStoreApi } from '../context';
import { hasProgress } from '../progress';
import styles from './Dialogs.module.css';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** New game: difficulty, optional seed, and a confirmation before discarding a game in progress. */
export function NewGameDialog({ onClose }: { onClose(): void }) {
  const store = useStoreApi();
  const status = useGame((g) => g.status);
  const error = useGame((g) => g.error);
  const current = useGame((g) => g.puzzle?.difficulty);
  const [difficulty, setDifficulty] = useState<Difficulty>(current ?? 'medium');
  const [seed, setSeed] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const generating = status === 'generating';

  const start = async () => {
    setConfirming(false);
    setSubmitted(true);
    await store.getState().newGame(seed.trim() || undefined, difficulty);
    if (store.getState().status === 'playing') onClose();
  };

  const onStart = () => {
    const s = store.getState();
    if (s.status === 'playing' && hasProgress(s)) setConfirming(true);
    else void start();
  };

  if (confirming)
    return (
      <Modal
        title="Discard this game?"
        testId="newgame-confirm"
        onCancel={() => setConfirming(false)}
        initialFocus="actions"
        actions={
          <>
            <button
              type="button"
              data-testid="newgame-confirm-no"
              onClick={() => setConfirming(false)}
            >
              Keep playing
            </button>
            <button
              type="button"
              className={styles.primary}
              data-testid="newgame-confirm-yes"
              onClick={() => void start()}
            >
              Discard and start
            </button>
          </>
        }
      >
        <p>Your placements and notes in the current game will be lost.</p>
      </Modal>
    );

  return (
    <Modal
      title="New game"
      testId="newgame-dialog"
      onCancel={onClose}
      actions={
        <>
          <button type="button" data-testid="newgame-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="newgame-form"
            className={styles.primary}
            data-testid="newgame-start"
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Start'}
          </button>
        </>
      }
    >
      <form
        id="newgame-form"
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!generating) onStart();
        }}
      >
        <fieldset className={styles.fieldset} disabled={generating}>
          <legend>Difficulty</legend>
          {DIFFICULTIES.map((d) => (
            <label key={d}>
              <input
                type="radio"
                name="difficulty"
                data-testid={`newgame-difficulty-${d}`}
                checked={difficulty === d}
                onChange={() => setDifficulty(d)}
              />
              {d}
            </label>
          ))}
        </fieldset>
        <label className={styles.field}>
          Seed (optional)
          <input
            type="text"
            data-testid="newgame-seed"
            value={seed}
            placeholder="Leave empty for a random puzzle"
            autoComplete="off"
            disabled={generating}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        <p className={styles.muted}>The same seed and difficulty always give the same puzzle.</p>
        {generating && (
          <p role="status" data-testid="newgame-generating">
            Generating…
          </p>
        )}
        {submitted && error && (
          <p role="alert" className={styles.error} data-testid="newgame-error">
            Could not generate a puzzle: {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
