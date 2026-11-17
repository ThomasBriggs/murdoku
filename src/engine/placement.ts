import { GRID_SIZE, PEOPLE } from './constants';
import type { Rng } from './rng';
import type { FloorPlan, Person, Solution } from './types';

const MAX_ATTEMPTS = 20000;

export function placeSolution(rng: Rng, plan: FloorPlan, people: readonly Person[]): Solution {
  const victim = people.find((p) => p.isVictim);
  if (!victim) throw new Error('placeSolution: no victim');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cols = rng.shuffle(Array.from({ length: GRID_SIZE }, (_, i) => i));
    const rowOfPerson = rng.shuffle(Array.from({ length: PEOPLE }, (_, i) => i)); // row r holds person rowOfPerson[r]
    const cellOf: Solution['cellOf'] = new Array(PEOPLE);
    for (let r = 0; r < GRID_SIZE; r++) cellOf[rowOfPerson[r]!] = { r, c: cols[r]! };

    const roomOfPerson = cellOf.map((cell) => plan.roomOf[cell.r]![cell.c]!);
    const victimRoom = roomOfPerson[victim.id]!;
    const inVictimRoom = people.filter((p) => !p.isVictim && roomOfPerson[p.id] === victimRoom);
    if (inVictimRoom.length !== 1) continue;

    const counts = new Map<number, number>();
    for (const p of people)
      counts.set(roomOfPerson[p.id]!, (counts.get(roomOfPerson[p.id]!) ?? 0) + 1);
    const others = people.filter((p) => !p.isVictim && roomOfPerson[p.id] !== victimRoom);
    // variety: some pair of suspects shares a room, and some suspect is alone
    const pairShares = others.some((p) => counts.get(roomOfPerson[p.id]!)! >= 2);
    const someAlone = others.some((p) => counts.get(roomOfPerson[p.id]!) === 1);
    if (!pairShares || !someAlone) continue;

    return { cellOf, murdererId: inVictimRoom[0]!.id };
  }
  throw new Error('placeSolution: no valid placement found');
}
