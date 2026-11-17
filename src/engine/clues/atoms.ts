import type { Atom } from './types';

/** Stable string key for an atom (dedup, caches). */
export function atomKey(atom: Atom): string {
  switch (atom.kind) {
    case 'inRoom':
    case 'notInRoom':
      return `${atom.kind}:${atom.room}`;
    case 'on':
    case 'beside':
    case 'notBeside':
      return `${atom.kind}:${atom.furniture}`;
    case 'row':
    case 'col':
      return `${atom.kind}:${atom.index}`;
    case 'sameRoomAs':
      return `sameRoomAs:${atom.person}`;
    default:
      return atom.kind;
  }
}

/** Relational atoms depend on where other people are; the rest depend only on the cell. */
export function isRelational(atom: Atom): boolean {
  return atom.kind === 'alone' || atom.kind === 'sameRoomAs';
}
