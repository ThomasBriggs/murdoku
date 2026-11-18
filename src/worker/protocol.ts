import type { Deduction } from '../engine/solver/logical';
import type { CellKey, Difficulty, PersonId, PuzzleView } from '../engine/types';

/** The player's board as sent to the worker: person -> cell key (null/absent when unplaced). */
export type Placements = Readonly<Record<PersonId, CellKey | null | undefined>>;

interface Base {
  /** Correlates a response with its request. */
  id: number;
}

export type EngineRequest =
  | (Base & { type: 'generate'; seed: string; difficulty: Difficulty })
  | (Base & { type: 'check'; placements: Placements })
  | (Base & { type: 'hint'; placements: Placements; revealOne?: boolean })
  | (Base & { type: 'accuse'; placements: Placements; suspectId: PersonId });

/** A solver deduction as delivered to the UI (the UI may not import the solver itself). */
export type HintDeduction = Deduction;

export type RequestType = EngineRequest['type'];

export type HintResult =
  /** All current placements are correct: the next logical step. */
  | { type: 'deduction'; deduction: Deduction }
  /** `count` placements are wrong; `person` is set only when revealOne was requested. */
  | { type: 'wrong'; count: number; person?: PersonId }
  /** Board complete or the solver cannot find a step. */
  | { type: 'none' };

export type ErrorCode = 'not-generated' | 'bad-request' | 'internal' | 'timeout';

export type EngineResponse =
  | (Base & { type: 'generate'; puzzle: PuzzleView })
  | (Base & { type: 'check'; correct: PersonId[]; wrong: PersonId[] })
  | (Base & { type: 'hint'; result: HintResult })
  | (Base & {
      type: 'accuse';
      placementCorrect: boolean;
      accusationCorrect: boolean;
      won: boolean;
    })
  | (Base & { type: 'error'; code: ErrorCode; message: string });

/** Success response type for each request type. */
export type ResponseFor<T extends RequestType> = Extract<EngineResponse, { type: T }>;

/** Distributes Omit over the union and drops the id (the client assigns it). */
export type RequestBody = EngineRequest extends infer R
  ? R extends EngineRequest
    ? Omit<R, 'id'>
    : never
  : never;
