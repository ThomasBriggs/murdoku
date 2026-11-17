import type { FurnitureType, PersonId, RoomId } from '../types';

/** Atomic clue facts (SPEC §9). Evaluation/rendering arrive in milestone 3. */
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
