import type { CSSProperties } from 'react';
import type { Room } from '../engine/types';
import styles from './RoomLegend.module.css';
import type { RoomColor } from './roomColors';
import type { Highlight } from './types';

/** Colour swatch + full name per room; hovering or focusing one highlights the room's cells. */
export function RoomLegend({
  rooms,
  colors,
  onHighlight,
}: {
  rooms: readonly Room[];
  colors: Map<number, RoomColor>;
  onHighlight(h: Highlight | null): void;
}) {
  return (
    <ul className={styles.legend} aria-label="Rooms" data-testid="room-legend">
      {rooms.map((room) => {
        const h: Highlight = { kind: 'room', id: room.id };
        const color = colors.get(room.id);
        return (
          <li
            key={room.id}
            className={styles.item}
            tabIndex={0}
            data-testid={`legend-room-${room.id}`}
            onMouseEnter={() => onHighlight(h)}
            onMouseLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(h)}
            onBlur={() => onHighlight(null)}
          >
            <span
              className={styles.swatch}
              style={{ '--room-l': color?.light, '--room-d': color?.dark } as CSSProperties}
            />
            {room.name}
          </li>
        );
      })}
    </ul>
  );
}
