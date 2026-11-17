import type { Rng } from './rng';
import type { Person } from './types';
import { PEOPLE } from './constants';

export const NAME_POOL: readonly string[] = [
  'Alice',
  'Arthur',
  'Beatrice',
  'Bernard',
  'Charles',
  'Clara',
  'Daphne',
  'Douglas',
  'Edmund',
  'Eleanor',
  'Florence',
  'Frederick',
  'Gerald',
  'Grace',
  'Harold',
  'Hester',
  'Imogen',
  'Ivor',
  'Josephine',
  'Julian',
  'Katherine',
  'Kenneth',
  'Lucille',
  'Leonard',
  'Margaret',
  'Montague',
  'Nora',
  'Nigel',
  'Olive',
  'Oswald',
  'Penelope',
  'Percival',
  'Reginald',
  'Rosalind',
  'Sybil',
  'Stanley',
  'Theodora',
  'Thomas',
  'Ursula',
  'Victor',
  'Vera',
  'Winifred',
  'Walter',
  'Yvonne',
  'Zelda',
];

/** Distinct token colours (readable with white or dark initials). */
export const TOKEN_COLORS: readonly string[] = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#0aa5a5',
  '#c2185b',
  '#8d6e00',
  '#546e7a',
  '#7cb342',
  '#6d4c41',
  '#d81b60',
];

export function pickPeople(rng: Rng): Person[] {
  const names: string[] = [];
  const initials = new Set<string>();
  for (const name of rng.shuffle(NAME_POOL)) {
    const initial = name.charAt(0);
    if (initials.has(initial)) continue;
    initials.add(initial);
    names.push(name);
    if (names.length === PEOPLE) break;
  }
  const colors = rng.shuffle(TOKEN_COLORS);
  const victim = rng.int(0, PEOPLE - 1);
  return names.map((name, id) => ({
    id,
    name,
    initial: name.charAt(0),
    color: colors[id]!,
    isVictim: id === victim,
  }));
}
