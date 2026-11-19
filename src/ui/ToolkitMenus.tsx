import { useState } from 'react';
import { LAYER_IDS, type LayerId } from '../state/annotations';
import styles from './Toolbar.module.css';

export const LAYER_LABELS: Record<LayerId, string> = {
  crosses: 'Marks (✗ • ?)',
  candidates: 'Candidate initials',
  highlights: 'Highlights',
  drawing: 'Drawing',
  margins: 'Room notes',
  tentative: 'Tentative placements',
};

/** Layers that can be toggled and cleared. */
const AVAILABLE: Record<LayerId, boolean> = {
  crosses: true,
  candidates: true,
  highlights: true,
  drawing: true,
  margins: true,
  tentative: true,
};

export type ClearChoice =
  { kind: 'layer'; layer: LayerId } | { kind: 'annotations' } | { kind: 'everything' };

export function LayersMenu({
  visibility,
  onToggle,
}: {
  visibility: Record<LayerId, boolean>;
  onToggle(layer: LayerId, visible: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.settingsWrap}>
      <button
        type="button"
        data-testid="layers-button"
        aria-expanded={open}
        aria-controls="layers-popover"
        title="Show or hide layers"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">◫</span>
        <span>Layers</span>
      </button>
      {open && (
        <div
          id="layers-popover"
          className={`${styles.popover} ${styles.popoverLeft}`}
          role="group"
          aria-label="Layers"
          data-testid="layers-popover"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          {LAYER_IDS.map((l) => (
            <label key={l}>
              <input
                type="checkbox"
                data-testid={`layer-${l}`}
                checked={visibility[l]}
                disabled={!AVAILABLE[l]}
                onChange={(e) => onToggle(l, e.target.checked)}
              />
              {LAYER_LABELS[l]}
              {!AVAILABLE[l] && ' (coming soon)'}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClearMenu({ onChoose }: { onChoose(choice: ClearChoice): void }) {
  const [open, setOpen] = useState(false);
  const choose = (c: ClearChoice) => {
    setOpen(false);
    onChoose(c);
  };
  return (
    <div className={styles.settingsWrap}>
      <button
        type="button"
        data-testid="clear-button"
        aria-expanded={open}
        aria-controls="clear-popover"
        title="Clear annotations"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⌫</span>
        <span>Clear…</span>
      </button>
      {open && (
        <div
          id="clear-popover"
          className={`${styles.popover} ${styles.popoverLeft}`}
          role="menu"
          aria-label="Clear"
          data-testid="clear-popover"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <strong>Clear one layer</strong>
          {LAYER_IDS.filter((l) => AVAILABLE[l]).map((l) => (
            <button
              type="button"
              role="menuitem"
              key={l}
              data-testid={`clear-layer-${l}`}
              onClick={() => choose({ kind: 'layer', layer: l })}
            >
              {LAYER_LABELS[l]}
            </button>
          ))}
          <hr />
          <button
            type="button"
            role="menuitem"
            data-testid="clear-annotations"
            onClick={() => choose({ kind: 'annotations' })}
          >
            All annotations (keep placements)
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="clear-everything"
            onClick={() => choose({ kind: 'everything' })}
          >
            Reset everything
          </button>
        </div>
      )}
    </div>
  );
}

export function describeClear(choice: ClearChoice): { title: string; body: string; label: string } {
  switch (choice.kind) {
    case 'layer':
      return {
        title: `Clear ${LAYER_LABELS[choice.layer].toLowerCase()}?`,
        body: 'Everything in this layer is removed. Placements stay. You can undo this.',
        label: 'Clear layer',
      };
    case 'annotations':
      return {
        title: 'Clear all annotations?',
        body: 'Marks, candidates, highlights, notes, clue ticks and tentative placements are removed. Placements stay. You can undo this.',
        label: 'Clear annotations',
      };
    case 'everything':
      return {
        title: 'Reset everything?',
        body: 'Placements and every annotation are removed. You can undo this.',
        label: 'Reset everything',
      };
  }
}
