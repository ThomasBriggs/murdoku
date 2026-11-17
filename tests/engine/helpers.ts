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
