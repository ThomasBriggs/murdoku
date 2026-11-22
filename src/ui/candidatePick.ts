import { GRID_SIZE } from '../engine/constants';
import { isOccupiable } from '../engine/furniture';
import type { Person, PersonId, PuzzleView } from '../engine/types';
import { panelOrder } from '../state/annotations';

/**
 * Who a press-and-hold (or Enter) on a cell could place when nobody is selected: the people
 * whose candidate initial is shown there and who are not on the board yet. A pencil guess
 * still counts as unplaced. Empty when the cell is occupied or blocked, or the candidates
 * layer is hidden. Panel order.
 */
export function holdCandidates(args: {
  puzzle: Pick<PuzzleView, 'furniture' | 'people'>;
  key: number;
  /** The cell's candidate "yes" mask (bit = slot in panel order). */
  yes: number | undefined;
  candidatesVisible: boolean;
  placements: Readonly<Record<PersonId, number | null>>;
}): PersonId[] {
  const { puzzle, key, yes, candidatesVisible, placements } = args;
  if (!candidatesVisible || !yes) return [];
  const f = puzzle.furniture[Math.floor(key / GRID_SIZE)]?.[key % GRID_SIZE];
  if (f != null && !isOccupiable(f)) return [];
  if (Object.values(placements).some((k) => k === key)) return [];
  return panelOrder(puzzle.people as Person[]).flatMap((person, slot) =>
    yes & (1 << slot) && placements[person.id] == null ? [person.id] : [],
  );
}
