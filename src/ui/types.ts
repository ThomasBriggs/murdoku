import type { FurnitureType, PersonId, RoomId } from '../engine/types';

/**
 * What a hovered clue word or person card asks the board to light up. A person
 * lights up where they are placed, pencilled in, or noted as a candidate.
 */
export type Highlight =
  | { kind: 'room'; id: RoomId }
  | { kind: 'furniture'; id: FurnitureType }
  | { kind: 'person'; id: PersonId };

/** How a cell relates to the hovered person (strongest first). */
export type PersonMark = 'placed' | 'tentative' | 'candidate';

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
