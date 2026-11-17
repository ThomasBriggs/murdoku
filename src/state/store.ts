import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { checkPlacement, type Violation } from '../engine/clues/evaluate';
import { PEOPLE } from '../engine/constants';
import {
  parseCellKey,
  type CellKey,
  type Difficulty,
  type PersonId,
  type PuzzleView,
} from '../engine/types';
import { createEngineClient, type EngineClient } from '../worker/client';
import type { HintResult } from '../worker/protocol';
import { emptyHistory, popRedo, popUndo, pushHistory, type History } from './history';

export type GameStatus = 'idle' | 'generating' | 'playing' | 'won';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  autoCross: boolean;
  conflictHighlight: boolean;
  autoClearCandidates: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoCross: true,
  conflictHighlight: true,
  autoClearCandidates: true,
};

export type Placements = Record<PersonId, CellKey | null>;

/**
 * The part of the state that undo/redo restores. Milestones 5b/6 add their
 * annotation fields here (and to `undoableOf` / `restoreUndoable`); the
 * history mechanism itself needs no change.
 */
export interface Undoable {
  placements: Placements;
}

export type PlaceResult = 'placed' | 'moved' | 'displaced' | 'noop' | 'refused';

export interface GameState {
  puzzle: PuzzleView | null;
  status: GameStatus;
  error: string | null;
  selectedPerson: PersonId | null;
  placements: Placements;
  history: History<Undoable>;
  elapsedMs: number;
  running: boolean;
  hintsUsed: number;
  checksUsed: number;
  assistsUsed: number;
  settings: Settings;
}

export interface GameActions {
  newGame(seed: string | undefined, difficulty: Difficulty): Promise<void>;
  selectPerson(person: PersonId | null): void;
  /**
   * Place `person` on `cell`. Rules: refused on blocking cells (and unless
   * playing); an already-placed person is moved; a cell held by another person
   * is taken over and that person becomes unplaced ('displaced'); placing a
   * person on their current cell is a no-op.
   */
  place(person: PersonId, cell: CellKey): PlaceResult;
  remove(person: PersonId): boolean;
  undo(): boolean;
  redo(): boolean;
  reset(): void;
  check(): Promise<{ correct: PersonId[]; wrong: PersonId[] } | null>;
  hint(revealOne?: boolean): Promise<HintResult | null>;
  accuse(suspectId: PersonId): Promise<{
    placementCorrect: boolean;
    accusationCorrect: boolean;
    won: boolean;
  } | null>;
  tick(deltaMs: number): void;
  setRunning(running: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
}

export type GameStore = GameState & GameActions;

function emptyPlacements(): Placements {
  const p: Placements = {};
  for (let i = 0; i < PEOPLE; i++) p[i] = null;
  return p;
}

export function undoableOf(s: Pick<GameState, 'placements'>): Undoable {
  return { placements: s.placements };
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface GameStoreDeps {
  client: EngineClient;
  /** Seed generator (injectable for tests). */
  randomSeed?: () => string;
}

export function createGameStore(deps: GameStoreDeps): StoreApi<GameStore> {
  const { client } = deps;
  const makeSeed = deps.randomSeed ?? randomSeed;
  // Guards against a slow generate resolving after a newer newGame call.
  let generation = 0;

  return createStore<GameStore>()(
    immer((set, get) => {
      /**
       * Apply a board-changing mutation and record the previous (plain, frozen)
       * snapshot in the history. Callers only invoke this when something changes.
       */
      function commit(mutate: (draft: GameStore) => void): void {
        const before = undoableOf(get());
        set((d) => {
          mutate(d);
          pushHistory(d.history, before);
        });
      }

      const playing = () => get().status === 'playing';

      return {
        puzzle: null,
        status: 'idle',
        error: null,
        selectedPerson: null,
        placements: emptyPlacements(),
        history: emptyHistory(),
        elapsedMs: 0,
        running: false,
        hintsUsed: 0,
        checksUsed: 0,
        assistsUsed: 0,
        settings: { ...DEFAULT_SETTINGS },

        async newGame(seed, difficulty) {
          const mine = ++generation;
          const useSeed = seed && seed.length > 0 ? seed : makeSeed();
          set((d) => {
            d.puzzle = null;
            d.status = 'generating';
            d.error = null;
            d.selectedPerson = null;
            d.placements = emptyPlacements();
            d.history = emptyHistory();
            d.elapsedMs = 0;
            d.running = false;
            d.hintsUsed = 0;
            d.checksUsed = 0;
            d.assistsUsed = 0;
          });
          try {
            const puzzle = await client.generate(useSeed, difficulty);
            if (mine !== generation) return;
            set((d) => {
              d.puzzle = puzzle;
              d.status = 'playing';
              d.running = true;
            });
          } catch (e) {
            if (mine !== generation) return;
            set((d) => {
              d.status = 'idle';
              d.error = e instanceof Error ? e.message : String(e);
            });
          }
        },

        selectPerson(person) {
          set((d) => {
            d.selectedPerson = person;
          });
        },

        place(person, cell) {
          const s = get();
          if (!s.puzzle || s.status !== 'playing') return 'refused';
          if (!s.puzzle.people.some((p) => p.id === person)) return 'refused';
          const current = s.placements[person] ?? null;
          if (current === cell) return 'noop';
          // Blocking cells: checkPlacement reports a 'blocked' violation for a lone person.
          const probe = s.puzzle.people.map(() => null) as (ReturnType<
            typeof parseCellKey
          > | null)[];
          probe[person] = parseCellKey(cell);
          if (checkPlacement(s.puzzle, probe).some((v) => v.kind === 'blocked')) return 'refused';

          const occupant = s.puzzle.people.find(
            (p) => p.id !== person && s.placements[p.id] === cell,
          );
          commit((d) => {
            if (occupant) d.placements[occupant.id] = null;
            d.placements[person] = cell;
          });
          return occupant ? 'displaced' : current !== null ? 'moved' : 'placed';
        },

        remove(person) {
          if (!playing() || get().placements[person] == null) return false;
          commit((d) => {
            d.placements[person] = null;
          });
          return true;
        },

        undo() {
          if (!playing()) return false;
          let ok = false;
          const current = undoableOf(get());
          set((d) => {
            const prev = popUndo(d.history, current);
            if (prev) {
              d.placements = prev.placements;
              ok = true;
            }
          });
          return ok;
        },

        redo() {
          if (!playing()) return false;
          let ok = false;
          const current = undoableOf(get());
          set((d) => {
            const next = popRedo(d.history, current);
            if (next) {
              d.placements = next.placements;
              ok = true;
            }
          });
          return ok;
        },

        reset() {
          if (!playing() || !Object.values(get().placements).some((c) => c !== null)) return;
          // Recorded as a normal board change, so a reset can be undone.
          commit((d) => {
            d.placements = emptyPlacements();
          });
        },

        async check() {
          if (!playing()) return null;
          const result = await client.check(get().placements);
          set((d) => {
            d.checksUsed += 1;
          });
          return result;
        },

        async hint(revealOne) {
          if (!playing()) return null;
          const result = await client.hint(get().placements, revealOne);
          set((d) => {
            d.hintsUsed += 1;
          });
          return result;
        },

        async accuse(suspectId) {
          const s = get();
          if (s.status !== 'playing' || !allPlaced(s)) return null;
          const gen = generation;
          const result = await client.accuse(s.placements, suspectId);
          if (result.won && gen === generation) {
            set((d) => {
              d.status = 'won';
              d.running = false;
            });
          }
          return result;
        },

        tick(deltaMs) {
          set((d) => {
            if (d.running) d.elapsedMs += deltaMs;
          });
        },

        setRunning(running) {
          set((d) => {
            if (d.status === 'playing') d.running = running;
          });
        },

        updateSettings(patch) {
          set((d) => {
            Object.assign(d.settings, patch);
          });
        },
      };
    }),
  );
}

// ------------------------------------------------------------------ selectors

type PlacementsState = Pick<GameState, 'placements' | 'puzzle'>;

/** People without a cell yet. */
export function selectUnplaced(s: PlacementsState): PersonId[] {
  return (s.puzzle?.people ?? []).map((p) => p.id).filter((id) => s.placements[id] == null);
}

export function allPlaced(s: PlacementsState): boolean {
  return s.puzzle !== null && selectUnplaced(s).length === 0;
}

/** Rule/clue violations in the current board. Pure; never needs the solution. */
export function selectConflicts(s: PlacementsState): Violation[] {
  if (!s.puzzle) return [];
  return checkPlacement(
    s.puzzle,
    s.puzzle.people.map((p) => {
      const key = s.placements[p.id];
      return key == null ? null : parseCellKey(key);
    }),
  );
}

// ------------------------------------------------------------------ app singleton

let defaultStore: StoreApi<GameStore> | null = null;

/** App-wide store bound to the real worker (created on first use). */
export function getGameStore(): StoreApi<GameStore> {
  return (defaultStore ??= createGameStore({ client: createEngineClient() }));
}

export function useGameStore<T>(store: StoreApi<GameStore>, selector: (s: GameStore) => T): T {
  return useStore(store, selector);
}
