import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Person } from '../engine/types';
import { GRID_SIZE } from '../engine/constants';
import styles from './RadialPick.module.css';
import { Token } from './Token';

/** Ring radius and item size, in cell widths. */
const RADIUS = 1.5;
const ITEM = 0.78;

/**
 * Radial menu over the board: pick which noted person to place on a cell.
 * Lives inside a board-sized overlay; positions are percentages of the grid.
 */
export function RadialPick({
  cellKey,
  people,
  onPick,
  onClose,
}: {
  cellKey: number;
  people: Person[];
  onPick(id: number): void;
  /** `refocus`: put focus back on the cell (Escape, Cancel, after a pick). */
  onClose(refocus: boolean): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** A pointer pick needs a fresh press on the menu: the press that opened it must not pick. */
  const armed = useRef(false);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [onClose]);

  const cell = 100 / GRID_SIZE;
  const reach = RADIUS * cell + (ITEM * cell) / 2;
  const clamp = (v: number) => Math.min(100 - reach, Math.max(reach, v));
  const ox = ((cellKey % GRID_SIZE) + 0.5) * cell;
  const oy = (Math.floor(cellKey / GRID_SIZE) + 0.5) * cell;
  const cx = clamp(ox);
  const cy = clamp(oy);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') e.preventDefault();
    else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
  };

  const pick = (id: number) => {
    onPick(id);
    onClose(true);
  };

  return (
    <div className={styles.overlay}>
      <div
        ref={ref}
        className={styles.menu}
        style={{ left: `${cx}cqw`, top: `${cy}cqw` }}
        onKeyDown={onKeyDown}
        onPointerDown={() => (armed.current = true)}
      >
        <div
          className={styles.menu}
          role="menu"
          aria-label="Place who here?"
          data-testid="radial-pick"
        >
          {people.map((person, i) => {
            const a = (i / people.length) * 2 * Math.PI - Math.PI / 2;
            return (
              <button
                type="button"
                key={person.id}
                role="menuitem"
                className={styles.item}
                data-testid={`radial-pick-${person.id}`}
                aria-label={`Place ${person.name}`}
                title={`Place ${person.name}`}
                style={{
                  left: `${Math.cos(a) * RADIUS * cell}cqw`,
                  top: `${Math.sin(a) * RADIUS * cell}cqw`,
                  width: `${ITEM * cell}cqw`,
                }}
                onClick={(e) => {
                  if (e.detail === 0 || armed.current) pick(person.id);
                }}
              >
                <Token person={person} scope="pick-" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.cancel}
          data-testid="radial-pick-cancel"
          aria-label="Cancel"
          title="Cancel"
          tabIndex={-1}
          style={{
            left: `${ox - cx}cqw`,
            top: `${oy - cy}cqw`,
            width: `${ITEM * cell * 0.6}cqw`,
          }}
          onClick={(e) => {
            if (e.detail === 0 || armed.current) onClose(true);
          }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
