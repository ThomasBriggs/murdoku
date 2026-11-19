import type { FurnitureType, PersonId, RoomId } from '../types';

/**
 * Atomic clue facts (SPEC §9).
 *
 * `row` / `col` indices are 0-based internally (rendered as rows 1-9 and
 * columns A-I). `beside` uses `neighbours()` (ADJACENCY) restricted to the
 * same room: furniture on the other side of a wall does not count. `roomCorner` / `roomEdge` are defined in board.ts.
 */
export type Atom =
  | { kind: 'inRoom' | 'notInRoom'; room: RoomId }
  | { kind: 'on' | 'beside' | 'notBeside'; furniture: FurnitureType }
  | { kind: 'row' | 'col'; index: number }
  | { kind: 'alone' }
  | { kind: 'sameRoomAs'; person: PersonId }
  | { kind: 'roomCorner' | 'roomEdge' };

export interface Clue {
  person: PersonId;
  atoms: Atom[];
}
