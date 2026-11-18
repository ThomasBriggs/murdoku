import type { FurnitureType, PersonId, RoomId } from '../engine/types';

/** What a hovered clue word asks the board to light up. */
export type Highlight = { kind: 'room'; id: RoomId } | { kind: 'furniture'; id: FurnitureType };

export { panelOrder } from '../state/annotations';

export const COLUMN_LETTERS = 'ABCDEFGHI';

/** Conflict messages per person, from violation list. */
export function conflictsByPerson(
  violations: readonly { persons: PersonId[]; message: string }[],
): Map<PersonId, string[]> {
  const out = new Map<PersonId, string[]>();
  for (const v of violations)
    for (const p of v.persons) {
      const list = out.get(p) ?? [];
      if (!list.includes(v.message)) list.push(v.message);
      out.set(p, list);
    }
  return out;
}
