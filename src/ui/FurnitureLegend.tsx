import { useMemo } from 'react';
import { FURNITURE } from '../engine/furniture';
import type { FurnitureType } from '../engine/types';
import { FurnitureIcon } from './icons/FurnitureIcon';
import styles from './FurnitureLegend.module.css';
import type { Highlight } from './types';

/**
 * One entry per furniture type on the board. Clicking one selects every cell
 * with that type (Shift adds to the selection); hovering highlights them.
 */
export function FurnitureLegend({
  furniture,
  onHighlight,
  onSelect,
}: {
  furniture: readonly (readonly (FurnitureType | null)[])[];
  onHighlight(h: Highlight | null): void;
  onSelect(type: FurnitureType, additive: boolean): void;
}) {
  const types = useMemo(
    () => [...new Set(furniture.flat().filter((f): f is FurnitureType => f !== null))].sort(),
    [furniture],
  );
  return (
    <ul
      className={`${styles.legend} ${styles.furnLegend}`}
      aria-label="Furniture"
      data-testid="furniture-legend"
    >
      {types.map((t) => {
        const h: Highlight = { kind: 'furniture', id: t };
        return (
          <li key={t}>
            <button
              type="button"
              className={styles.furnBtn}
              data-testid={`legend-furniture-${t}`}
              title={`Select every ${FURNITURE[t].label.toLowerCase()} (Shift adds)`}
              onClick={(e) => onSelect(t, e.shiftKey)}
              onMouseEnter={() => onHighlight(h)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(h)}
              onBlur={() => onHighlight(null)}
            >
              <span className={styles.furnIcon}>
                <FurnitureIcon type={t} />
              </span>
              {FURNITURE[t].label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
