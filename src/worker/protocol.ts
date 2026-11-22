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
  | (Base & { type: 'accuse'; placements: Placements; suspectId: PersonId });

export type RequestType = EngineRequest['type'];

export type ErrorCode = 'not-generated' | 'bad-request' | 'internal' | 'timeout';

export type EngineResponse =
  | (Base & { type: 'generate'; puzzle: PuzzleView })
  | (Base & { type: 'check'; correct: PersonId[]; wrong: PersonId[] })
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
