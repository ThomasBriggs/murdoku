import { useMemo } from 'react';
import type { RoomId } from '../engine/types';
import styles from './Board.module.css';
import { wallSegments } from './walls';

/**
 * Room walls drawn as one SVG over the grid: straight runs with square caps, so
 * corners and T-junctions meet cleanly, and a frame around the whole board.
 * Strokes do not scale with the board, so the walls stay the same width at any size.
 */
export function WallLayer({ roomOf }: { roomOf: readonly (readonly RoomId[])[] }) {
  const segments = useMemo(() => wallSegments(roomOf), [roomOf]);
  const rows = roomOf.length;
  const cols = roomOf[0]?.length ?? 0;
  return (
    <svg
      className={styles.walls}
      data-testid="wall-layer"
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {segments.map((s) => (
        <line
          key={`${s.x1},${s.y1},${s.x2},${s.y2}`}
          data-testid="wall"
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <rect
        className={styles.wallFrame}
        x={0}
        y={0}
        width={cols}
        height={rows}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
