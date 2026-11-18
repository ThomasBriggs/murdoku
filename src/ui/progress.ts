import type { GameState } from '../state/store';
import { clearAllAnnotations } from '../state/annotations';

type ProgressState = Pick<GameState, 'placements' | 'tentativePlacements' | 'annotations'>;

/** Has the player put anything on the board (placements, pencil guesses or any annotation)? */
export function hasProgress(s: ProgressState): boolean {
  const any = (p: Record<number, number | null>) => Object.values(p).some((c) => c !== null);
  return (
    any(s.placements) ||
    any(s.tentativePlacements) ||
    // The clearing helper returns the same object when there is nothing to clear.
    clearAllAnnotations(s.annotations) !== s.annotations
  );
}
