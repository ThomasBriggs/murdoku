import { createRng } from '../../src/engine/rng';
import { generateFloorPlan } from '../../src/engine/floorplan';
import { pickPeople } from '../../src/engine/names';
import { placeSolution } from '../../src/engine/placement';
import { decorate } from '../../src/engine/decorate';

export const SEEDS = Array.from({ length: 500 }, (_, i) => `seed-${i}`);

export function build(seed: string) {
  const rng = createRng(seed);
  const plan = generateFloorPlan(rng.fork('plan'));
  const people = pickPeople(rng.fork('people'));
  const solution = placeSolution(rng.fork('place'), plan, people);
  const furniture = decorate(rng.fork('decorate'), plan, solution);
  return { plan, people, solution, furniture };
}

import { GENERATOR_VERSION } from '../../src/engine/constants';
import { deriveFacts } from '../../src/engine/clues/facts';
import type { Clue } from '../../src/engine/clues/types';
import type { Puzzle } from '../../src/engine/types';

/** A puzzle whose clues are `n` random true atoms per person (not necessarily unique). */
export function randomCluePuzzle(seed: string, n = 2) {
  const b = build(seed);
  const rng = createRng(`${seed}-clues`);
  const facts = deriveFacts(
    { roomOf: b.plan.roomOf, rooms: b.plan.rooms, furniture: b.furniture },
    b.solution,
  );
  const clues: Clue[] = b.people.map((p) => ({
    person: p.id,
    atoms: rng.shuffle(facts[p.id]!).slice(0, n),
  }));
  const puzzle: Puzzle = {
    version: GENERATOR_VERSION,
    seed,
    difficulty: 'easy',
    roomOf: b.plan.roomOf,
    rooms: b.plan.rooms,
    furniture: b.furniture,
    people: b.people,
    clues,
  };
  return { ...b, facts, puzzle };
}
