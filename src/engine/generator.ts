import { GENERATOR_VERSION } from './constants';
import { setCount, setIntersect, type CellSet } from './cellset';
import { atomKey } from './clues/atoms';
import { atomCells, getBoard } from './clues/board';
import { deriveFacts } from './clues/facts';
import type { Atom, Clue } from './clues/types';
import { decorate } from './decorate';
import { generateFloorPlan } from './floorplan';
import { pickPeople } from './names';
import { placeSolution } from './placement';
import { createRng, type Rng } from './rng';
import { countSolutions } from './solver/bruteforce';
import { solveLogically, type Technique } from './solver/logical';
import type { Difficulty, FloorPlan, FurnitureGrid, Person, Puzzle, Solution } from './types';

export interface GeneratedPuzzle {
  /** Everything the UI may see; contains no solution. */
  puzzle: Puzzle;
  /** Worker-only. */
  solution: Solution;
  /** Difficulty the finished puzzle actually grades as. */
  graded: Difficulty;
  /** Clue-selection attempts used (1 = first try). */
  attempts: number;
}

/** Hardest technique the solver may use, per requested difficulty (§5.5). */
export const TECHNIQUE_CEILING: Record<Difficulty, Technique> = { easy: 3, medium: 4, hard: 6 };

export function gradeOf(maxTechnique: number): Difficulty {
  return maxTechnique <= 3 ? 'easy' : maxTechnique === 4 ? 'medium' : 'hard';
}

const ORDER: Difficulty[] = ['easy', 'medium', 'hard'];
const MAX_ATTEMPTS = 14;
const ATTEMPTS_PER_LAYOUT = 5;
const MAX_ATOMS = 3;
const MAX_GROW_STEPS = 40;

/** Relative preference for atom kinds when choosing clues (row/col rare except on Easy). */
const KIND_WEIGHT: Record<Difficulty, Record<Atom['kind'], number>> = {
  easy: {
    inRoom: 3,
    on: 3,
    beside: 3,
    notBeside: 1,
    notInRoom: 1.5,
    row: 0.8,
    col: 0.8,
    alone: 1,
    sameRoomAs: 1,
    roomCorner: 1,
    roomEdge: 1,
  },
  medium: {
    inRoom: 2,
    on: 3,
    beside: 3,
    notBeside: 2,
    notInRoom: 2,
    row: 0.15,
    col: 0.15,
    alone: 2,
    sameRoomAs: 2,
    roomCorner: 1.5,
    roomEdge: 1.5,
  },
  hard: {
    inRoom: 1,
    on: 2,
    beside: 2,
    notBeside: 3,
    notInRoom: 3,
    row: 0.05,
    col: 0.05,
    alone: 3,
    sameRoomAs: 3,
    roomCorner: 2,
    roomEdge: 2,
  },
};
/** Hard cap on row + column atoms per puzzle (they are rare outside Easy, §5.4). */
export const ROW_COL_CAP: Record<Difficulty, number> = { easy: 4, medium: 2, hard: 1 };

const isRowCol = (a: Atom) => a.kind === 'row' || a.kind === 'col';
const rowColCount = (chosen: Atom[][], except = -1) =>
  chosen.reduce((n, atoms, p) => (p === except ? n : n + atoms.filter(isRowCol).length), 0);

/** How strongly the most-cutting facts are preferred when growing clues. */
const CUT_EXPONENT: Record<Difficulty, number> = { easy: 2, medium: 2, hard: 1.2 };

interface Layout {
  plan: FloorPlan;
  people: Person[];
  solution: Solution;
  furniture: FurnitureGrid;
}

function buildLayout(root: Rng): Layout {
  const plan = generateFloorPlan(root.fork('plan'));
  const people = pickPeople(root.fork('people'));
  const solution = placeSolution(root.fork('place'), plan, people);
  const furniture = decorate(root.fork('decorate'), plan, solution);
  return { plan, people, solution, furniture };
}

function makePuzzle(seed: string, difficulty: Difficulty, layout: Layout, atoms: Atom[][]): Puzzle {
  const clues: Clue[] = atoms.map((a, person) => ({ person, atoms: a }));
  return {
    version: GENERATOR_VERSION,
    seed,
    difficulty,
    roomOf: layout.plan.roomOf,
    rooms: layout.plan.rooms,
    furniture: layout.furniture,
    people: layout.people,
    clues,
  };
}

/** True facts minus those the fairness rules forbid. */
function fairFacts(layout: Layout): Atom[][] {
  const { plan, people, solution, furniture } = layout;
  const facts = deriveFacts({ roomOf: plan.roomOf, rooms: plan.rooms, furniture }, solution);
  const victim = people.find((p) => p.isVictim)!.id;
  const murderer = solution.murdererId;
  const vCell = solution.cellOf[victim]!;
  const victimRoom = plan.roomOf[vCell.r]![vCell.c]!;
  return facts.map((list, p) =>
    list.filter((a) => {
      if (a.kind === 'sameRoomAs') return a.person !== victim && a.person !== murderer;
      if (a.kind === 'inRoom' && p === murderer) return a.room !== victimRoom;
      return true;
    }),
  );
}

function pickInitial(rng: Rng, facts: Atom[], difficulty: Difficulty): Atom {
  return rng.weighted(facts, (a) => KIND_WEIGHT[difficulty][a.kind]);
}

/** Estimated candidate cells an atom removes from a person's current candidates. */
function cutOf(layout: Layout, cand: CellSet, atom: Atom): number {
  const board = getBoard({
    roomOf: layout.plan.roomOf,
    rooms: layout.plan.rooms,
    furniture: layout.furniture,
  });
  const cells = atomCells(board, atom);
  const have = setCount(cand);
  if (!cells) return have * 0.3; // relational: cannot be measured statically
  return have - setCount(setIntersect(cand, cells));
}

/** Greedy set of up to MAX_ATOMS facts that together leave the fewest cells. */
function strongestAtoms(layout: Layout, facts: Atom[], rng: Rng, rowColBudget: number): Atom[] {
  const board = getBoard({
    roomOf: layout.plan.roomOf,
    rooms: layout.plan.rooms,
    furniture: layout.furniture,
  });
  let cand = board.free;
  const out: Atom[] = [];
  const pool = rng.shuffle(facts);
  let budget = rowColBudget;
  while (out.length < MAX_ATOMS) {
    let best: Atom | null = null;
    let bestCut = 0;
    for (const a of pool) {
      if (out.includes(a) || (isRowCol(a) && budget <= 0)) continue;
      const cut = cutOf(layout, cand, a);
      if (cut > bestCut) {
        best = a;
        bestCut = cut;
      }
    }
    if (!best) break;
    out.push(best);
    if (isRowCol(best)) budget--;
    const cells = atomCells(board, best);
    if (cells) cand = setIntersect(cand, cells);
  }
  return out.length > 0 ? out : [pool.find((a) => !isRowCol(a)) ?? pool[0]!];
}

function attempt(
  seed: string,
  difficulty: Difficulty,
  layout: Layout,
  rng: Rng,
): { puzzle: Puzzle; grade: Difficulty } | null {
  const ceiling = TECHNIQUE_CEILING[difficulty];
  const facts = fairFacts(layout);
  const cap = ROW_COL_CAP[difficulty];
  const chosen: Atom[][] = [];
  for (const list of facts) {
    const allowed = rowColCount(chosen) < cap ? list : list.filter((a) => !isRowCol(a));
    chosen.push([pickInitial(rng, allowed, difficulty)]);
  }
  const mk = () => makePuzzle(seed, difficulty, layout, chosen);
  const solves = () => solveLogically(mk(), ceiling, { explain: false });

  // Grow: add the most-cutting fact to an ambiguous person until the solver finishes.
  const stuck = new Set<number>();
  const rebuilt = new Set<number>();
  let result = solves();
  for (let step = 0; !result.solved; step++) {
    if (step >= MAX_GROW_STEPS) return null;
    const open = chosen
      .map((atoms, p) => ({ p, atoms, n: setCount(result.candidates[p]!) }))
      .filter((x) => x.n > 1 && x.atoms.length < MAX_ATOMS && !stuck.has(x.p));
    if (open.length === 0) {
      // Everyone left is at the atom limit or out of useful facts: rebuild the
      // widest-open person from their strongest facts, once each.
      const wide = chosen
        .map((_, p) => ({ p, n: setCount(result.candidates[p]!) }))
        .filter((x) => x.n > 1 && !rebuilt.has(x.p))
        .sort((a, b) => b.n - a.n)[0];
      if (!wide) return null;
      rebuilt.add(wide.p);
      stuck.delete(wide.p);
      chosen[wide.p] = strongestAtoms(
        layout,
        facts[wide.p]!,
        rng,
        cap - rowColCount(chosen, wide.p),
      );
      result = solves();
      continue;
    }
    const { p, atoms } = rng.weighted(open, (x) => x.n);
    const have = new Set(atoms.map(atomKey));
    const rcFull = rowColCount(chosen) >= cap;
    const options = facts[p]!.filter((a) => !have.has(atomKey(a)) && !(rcFull && isRowCol(a)))
      .map((a) => ({ a, cut: cutOf(layout, result.candidates[p]!, a) }))
      .filter((o) => o.cut > 0);
    if (options.length === 0) {
      stuck.add(p);
      continue;
    }
    const lastSlot = atoms.length === MAX_ATOMS - 1;
    const pick = rng.weighted(
      options,
      (o) =>
        (lastSlot ? 1 : KIND_WEIGHT[difficulty][o.a.kind]) *
        Math.pow(o.cut + 0.5, lastSlot ? 4 : CUT_EXPONENT[difficulty]),
    );
    atoms.push(pick.a);
    result = solves();
  }

  // Prune: drop atoms in random order while still logically solvable within the ceiling.
  const slots: [number, Atom][] = [];
  chosen.forEach((atoms, p) => atoms.forEach((a) => slots.push([p, a])));
  for (const [p, atom] of rng.shuffle(slots)) {
    const atoms = chosen[p]!;
    if (atoms.length <= 1) continue;
    const idx = atoms.indexOf(atom);
    atoms.splice(idx, 1);
    if (!solves().solved) atoms.splice(idx, 0, atom);
  }

  const puzzle = mk();
  if (countSolutions(puzzle, 2) !== 1) return null; // should be impossible: logic is sound
  const grade = gradeOf(solveLogically(puzzle, 6, { explain: false }).maxTechniqueUsed);
  return { puzzle, grade };
}

/**
 * Generate a puzzle. Deterministic for (seed, difficulty, GENERATOR_VERSION).
 * The first layout is the same for every difficulty of a seed. When the grade
 * misses the request, retries with sub-seeds (and eventually new layouts);
 * after MAX_ATTEMPTS the closest grade wins.
 */
export function generatePuzzle(seed: string, difficulty: Difficulty): GeneratedPuzzle {
  const root = createRng(seed);
  const layouts: Layout[] = [];
  const layoutFor = (k: number): Layout =>
    (layouts[k] ??= buildLayout(k === 0 ? root : root.fork(`layout-${k}`)));
  const target = ORDER.indexOf(difficulty);
  let best: { puzzle: Puzzle; layout: Layout; grade: Difficulty } | null = null;
  const dist = (g: Difficulty) => Math.abs(ORDER.indexOf(g) - target);
  let tried = 0;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    tried++;
    const layout = layoutFor(Math.floor(i / ATTEMPTS_PER_LAYOUT));
    const r = attempt(seed, difficulty, layout, root.fork(`${difficulty}-attempt-${i}`));
    if (!r) continue;
    if (best === null || dist(r.grade) < dist(best.grade)) best = { ...r, layout };
    if (r.grade === difficulty) break;
  }
  if (!best) throw new Error(`generatePuzzle: no puzzle found for seed "${seed}"`);
  return {
    puzzle: best.puzzle,
    solution: best.layout.solution,
    graded: best.grade,
    attempts: tried,
  };
}
