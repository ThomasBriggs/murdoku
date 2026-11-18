import { FURNITURE, FURNITURE_TYPES } from '../../engine/furniture';
import { Modal } from '../ConfirmDialog';
import { SHORTCUTS } from '../shortcuts';
import { TOOLS } from '../ToolPalette';
import styles from './Dialogs.module.css';

const GROUPS = ['Playing', 'Tools', 'Panels'] as const;

/** Rules, furniture, clue glossary, tools and shortcuts. Furniture lists come from the catalogue. */
export function RulesDialog({ onClose }: { onClose(): void }) {
  const standable = FURNITURE_TYPES.filter((t) => FURNITURE[t].occupiable);
  const blocking = FURNITURE_TYPES.filter((t) => !FURNITURE[t].occupiable);
  return (
    <Modal
      title="How to play"
      testId="rules-dialog"
      onCancel={onClose}
      wide
      initialFocus="dialog"
      actions={
        <button type="button" data-testid="rules-close" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className={styles.rules}>
        <h3>The rules</h3>
        <ol>
          <li>
            The 9×9 board is split into rooms by thick walls. Nine people (eight suspects and the
            victim) must each stand on the board.
          </li>
          <li>
            Exactly one person in every row and one in every column, never two in a cell, and nobody
            on a blocking piece of furniture.
          </li>
          <li>
            Every person has a clue about where they were. Use them to work out who goes where.
          </li>
          <li>The murderer is the only suspect who was in the same room as the victim.</li>
          <li>
            Every puzzle has exactly one solution that can be found by logic alone, no guessing.
            Place everyone, then accuse the murderer to win.
          </li>
        </ol>

        <h3>Furniture</h3>
        <p data-testid="rules-standable">
          <strong>You can be on:</strong> {standable.map((t) => FURNITURE[t].label).join(', ')}.
        </p>
        <p data-testid="rules-blocking">
          <strong>Nobody can be on:</strong> {blocking.map((t) => FURNITURE[t].label).join(', ')}.
        </p>

        <h3>Reading the clues</h3>
        <dl>
          <dt>Beside</dt>
          <dd>Directly up, down, left or right of it. Diagonals do not count.</dd>
          <dt>In a corner</dt>
          <dd>A cell with a wall (or the board edge) on two sides that meet, within its room.</dd>
          <dt>Against a wall</dt>
          <dd>A cell with a wall on at least one side but not in a corner of its room.</dd>
          <dt>Alone in the room</dt>
          <dd>Nobody else, victim included, was in that room.</dd>
          <dt>Same room as</dt>
          <dd>Both stood somewhere in the same room, wherever it is.</dd>
          <dt>Rows and columns</dt>
          <dd>Rows are numbered 1–9 from the top, columns lettered A–I from the left.</dd>
        </dl>

        <h3>Tools</h3>
        <dl data-testid="rules-tools">
          {TOOLS.map((t) => (
            <div key={t.id} style={{ display: 'contents' }}>
              <dt>{t.label}</dt>
              <dd>{t.help}.</dd>
            </div>
          ))}
        </dl>
        <p>
          Hint explains the next step you can deduce. Check tells you how many placements are right
          or wrong. Both are counted. Accuse unlocks once all nine are placed.
        </p>

        <h3>Keyboard shortcuts</h3>
        {GROUPS.map((g) => (
          <div key={g}>
            <p className={styles.muted}>{g}</p>
            <div className={styles.keys} data-testid={`rules-keys-${g.toLowerCase()}`}>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.id} style={{ display: 'contents' }}>
                  <kbd>{s.keys}</kbd>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
