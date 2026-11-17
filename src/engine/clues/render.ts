import { FURNITURE } from '../furniture';
import type { FurnitureType, Person, PersonId, Room, RoomId } from '../types';
import type { Atom, Clue } from './types';

export type TokenKind = 'room' | 'furniture' | 'person' | 'plain';

/** A run of text in a rendered clue. Concatenating all tokens gives the sentence. */
export interface ClueToken {
  text: string;
  kind: TokenKind;
  /** RoomId for 'room', FurnitureType for 'furniture', PersonId for 'person'. */
  ref?: RoomId | FurnitureType | PersonId;
}

export interface RenderedClue {
  text: string;
  tokens: ClueToken[];
}

export interface RenderContext {
  rooms: readonly Room[];
  people: readonly Person[];
}

type Piece = string | ClueToken;
const plain = (text: string): ClueToken => ({ text, kind: 'plain' });
const room = (r: Room): ClueToken => ({ text: r.name, kind: 'room', ref: r.id });
const furn = (t: FurnitureType): ClueToken => ({
  text: FURNITURE[t].label.toLowerCase(),
  kind: 'furniture',
  ref: t,
});
const person = (p: Person): ClueToken => ({ text: p.name, kind: 'person', ref: p.id });

const letter = (i: number) => 'ABCDEFGHI'.charAt(i);

/** Slots at or above this are negative phrases; they come last, after ", but". */
const NEG_SLOT = 6;

interface Phrase {
  /** Sort slot: 0 = "sitting on…", 1 = "in the Room", 2+ = tail items, NEG_SLOT+ = negatives. */
  slot: number;
  /** Used when the phrase opens the sentence, or follows another phrase in the tail. */
  lead: Piece[];
  tail: Piece[];
}

function phrase(ctx: RenderContext, atom: Atom): Phrase {
  const roomOf = (id: RoomId) => ctx.rooms[id]!;
  switch (atom.kind) {
    case 'on': {
      const def = FURNITURE[atom.furniture];
      const p = [`${def.verb ?? 'on'} ${def.article} `, furn(atom.furniture)];
      return { slot: 0, lead: p, tail: p };
    }
    case 'inRoom': {
      const p = ['in the ', room(roomOf(atom.room))];
      return { slot: 1, lead: p, tail: p };
    }
    case 'notInRoom': {
      const p = ['not in the ', room(roomOf(atom.room))];
      return { slot: NEG_SLOT, lead: p, tail: p };
    }
    case 'beside': {
      const p = [`beside ${FURNITURE[atom.furniture].article} `, furn(atom.furniture)];
      return { slot: 2, lead: p, tail: p };
    }
    case 'notBeside': {
      const p = ['not beside any ', furn(atom.furniture)];
      return { slot: NEG_SLOT + 1, lead: p, tail: p };
    }
    case 'row': {
      const p = [`in row ${atom.index + 1}`];
      return { slot: 3, lead: p, tail: p };
    }
    case 'col': {
      const p = [`in column ${letter(atom.index)}`];
      return { slot: 3, lead: p, tail: p };
    }
    case 'roomCorner': {
      const p = ['in a corner of the room'];
      return { slot: 4, lead: p, tail: p };
    }
    case 'roomEdge': {
      const p = ['against a wall of the room'];
      return { slot: 4, lead: p, tail: p };
    }
    case 'alone':
      return { slot: 5, lead: ['alone in the room'], tail: ['with no one else in the room'] };
    case 'sameRoomAs': {
      const other = ctx.people[atom.person];
      const p = ['in the same room as ', other ? person(other) : plain('someone')];
      return { slot: 5, lead: p, tail: p };
    }
  }
}

function toTokens(pieces: Piece[]): ClueToken[] {
  const out: ClueToken[] = [];
  for (const p of pieces) {
    const t = typeof p === 'string' ? plain(p) : p;
    const last = out[out.length - 1];
    if (last && last.kind === 'plain' && t.kind === 'plain') last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

/**
 * Natural-English sentence for a clue, e.g.
 * "Charles was sitting on a chair in the Study, beside a bookshelf."
 *
 * Layout: the head is the "on" phrase followed by the "in the Room" phrase
 * (when present); remaining atoms follow, separated by commas with "and"
 * before the last one (just "and" for a single extra atom after a non-room head).
 */
export function renderClue(ctx: RenderContext, clue: Clue): RenderedClue {
  const subject = ctx.people[clue.person];
  const all = clue.atoms.map((a) => phrase(ctx, a)).sort((a, b) => a.slot - b.slot);
  const phrases = all.filter((p) => p.slot < NEG_SLOT);
  const negatives = all.filter((p) => p.slot >= NEG_SLOT);
  const head: Piece[] = [];
  let i = 0;
  const first = phrases[0];
  if (first) {
    head.push(...first.lead);
    i = 1;
    const second = phrases[1];
    if (first.slot === 0 && second && second.slot === 1) {
      head.push(' ', ...second.lead);
      i = 2;
    }
  }
  const rest = phrases.slice(i);
  const pieces: Piece[] = [subject ? person(subject) : plain('Someone'), ' was ', ...head];
  const headHasRoom = phrases.slice(0, i).some((p) => p.slot === 1);
  rest.forEach((p, k) => {
    const sep =
      k === 0
        ? headHasRoom || rest.length > 1
          ? ', '
          : ' and '
        : k === rest.length - 1
          ? ' and '
          : ', ';
    pieces.push(sep, ...p.tail);
  });
  negatives.forEach((p, k) => {
    if (phrases.length === 0 && k === 0) pieces.push(...p.lead);
    else pieces.push(k === 0 ? ', but ' : ' and ', ...p.tail);
  });
  pieces.push('.');
  const tokens = toTokens(pieces);
  return { text: tokens.map((t) => t.text).join(''), tokens };
}
