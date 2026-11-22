import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { checkPlacement, type Violation } from '../engine/clues/evaluate';
import { PEOPLE } from '../engine/constants';
import { isOccupiable } from '../engine/furniture';
import {
  parseCellKey,
  type CellKey,
  type Difficulty,
  type FurnitureType,
  type PersonId,
  type PuzzleView,
  type RoomId,
} from '../engine/types';
import {
  addClueHighlight,
  addStroke,
  appendScratchpadLine,
  cycleLogicCell,
  removeStrokes,
  setScratchpad,
  type LogicTable,
  type Stroke,
  clearAllAnnotations,
  clearCells,
  clearClueHighlights,
  clearLayer,
  clearPersonCandidates,
  COLOR_IDS,
  emptyAnnotations,
  removeClueHighlight,
  setColNote,
  setHighlight,
  setLayerVisible,
  setPersonNote,
  setRoomNote,
  setRowNote,
  slotOf,
  toggleCandidate,
  toggleClueStruck,
  toggleClueTick,
  toggleMark,
  type Annotations,
  type ColorId,
  type LayerId,
  type MarkKind,
} from './annotations';
import { mergeSelection, type SelectMode } from './selection';
import { createEngineClient, type EngineClient } from '../worker/client';
import { emptyStats, recordAbandon, recordWin, type Stats } from './stats';
import type { SavedGame } from './persistence';
import { emptyHistory, popRedo, popUndo, pushHistory, type History } from './history';

export type GameStatus = 'idle' | 'generating' | 'playing' | 'won';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  autoCross: boolean;
  conflictHighlight: boolean;
  autoClearCandidates: boolean;
  /** A tick in the logic grid's People x Rooms shades that person's possible cells (SPEC §6.5.5). */
  linkLogicGrid: boolean;
  /** Dim the cells the selected person's clue rules out; counts as an assist (SPEC §6.5.9). */
  showClueAllows: boolean;
  /**
   * Items pinned to the quick bar next to Place (SPEC §6.1). Everything else lives in the
   * tray, and a tool's keyboard shortcut only works while it is pinned here.
   */
  quickBar: QuickItem[];
}

/** Everything that can be pinned to the quick bar, in the order the bar shows them. */
export const QUICK_ITEMS = [
  'erase',
  'cross',
  'pencil',
  'dot',
  'unsure',
  'eliminate',
  'highlight',
  'select',
  'draw',
  'logic',
  'whatif',
] as const;
export type QuickItem = (typeof QUICK_ITEMS)[number];
export const DEFAULT_QUICK_BAR: readonly QuickItem[] = ['erase', 'cross'];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoCross: true,
  conflictHighlight: true,
  autoClearCandidates: true,
  linkLogicGrid: false,
  showClueAllows: false,
  quickBar: [...DEFAULT_QUICK_BAR],
};

export type Placements = Record<PersonId, CellKey | null>;

/**
 * The part of the state that undo/redo restores: real placements, tentative
 * (pencil) placements and all annotations. Layer visibility is a view
 * preference and is NOT rewound by undo (see `restoreAnnotations`).
 */
export interface Undoable {
  placements: Placements;
  tentativePlacements: Placements;
  annotations: Annotations;
  /**
   * The what-if stack is part of the undoable slice, so starting, keeping and
   * abandoning a branch are ordinary history entries: undo always restores a
   * consistent (board, stack) pair.
   */
  whatIfStack: WhatIfFrame[];
}

/** The branch-able part of the state: everything in `Undoable` except the stack itself. */
export type BoardSnapshot = Omit<Undoable, 'whatIfStack'>;

/** One level of what-if: the board as it was when the branch started. JSON-serialisable. */
export interface WhatIfFrame {
  snapshot: BoardSnapshot;
}

export const WHATIF_MAX_DEPTH = 3;

/** The active tool of the palette (SPEC §6.5). */
export type Tool =
  | 'place'
  | 'pencil'
  | 'cross'
  | 'dot'
  | 'unsure'
  | 'eliminate'
  | 'highlight'
  | 'erase'
  | 'select'
  | 'draw';

/** Pen layer tool (SPEC §6.5.6) and its size index into PEN_WIDTHS. */
export type PenKind = 'pen' | 'highlighter' | 'eraser';

export type TentativeResult = 'placed' | 'removed' | 'refused';

export type PlaceResult = 'placed' | 'moved' | 'displaced' | 'noop' | 'refused';

export interface GameState {
  puzzle: PuzzleView | null;
  status: GameStatus;
  error: string | null;
  selectedPerson: PersonId | null;
  placements: Placements;
  /** "I think B goes here": never counted for conflicts, allPlaced or accuse. */
  tentativePlacements: Placements;
  annotations: Annotations;
  /** Open what-if branches, outermost first (max WHATIF_MAX_DEPTH). Undoable. */
  whatIfStack: WhatIfFrame[];
  /** Multi-selection of cells (not undoable, not saved). */
  selection: CellKey[];
  tool: Tool;
  color: ColorId;
  history: History<Undoable>;
  elapsedMs: number;
  running: boolean;
  checksUsed: number;
  assistsUsed: number;
  /** People for whom "show where this clue allows" was already counted (once per person per game). */
  assistedPeople: PersonId[];
  /** Pen layer view state (not undoable, not saved). */
  pen: PenKind;
  penSize: 0 | 1 | 2;
  drawLocked: boolean;
  settings: Settings;
  /** Epoch ms when the game was started (saved). */
  startedAt: number;
  /** Lifetime statistics (see stats.ts for the rules). */
  stats: Stats;
  /** The game just won set a new best time (not saved; shown in the win dialog). */
  newBest: boolean;
}

export interface GameActions {
  newGame(seed: string | undefined, difficulty: Difficulty): Promise<void>;
  /** Regenerate the saved game's puzzle from its seed and restore the saved progress. */
  resumeGame(save: SavedGame): Promise<void>;
  setStats(stats: Stats): void;
  /** Record that the game in `save` was abandoned (counts only when it had a placement). */
  abandonSaved(save: Pick<SavedGame, 'placements' | 'status'>): void;
  resetStats(): void;
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
  accuse(suspectId: PersonId): Promise<{
    placementCorrect: boolean;
    accusationCorrect: boolean;
    won: boolean;
  } | null>;
  // ---- toolkit (SPEC §6.5); every one of these is undoable except the view state
  setTool(tool: Tool): void;
  setColor(color: ColorId): void;
  /** Next highlight colour in the cycle; returns it. */
  cycleColor(): ColorId;
  selectCells(cells: readonly CellKey[], mode?: SelectMode): void;
  clearSelection(): void;
  /** Toggle a cross / dot / unsure mark on cells. */
  applyMark(cells: readonly CellKey[], mark: MarkKind): boolean;
  /** Toggle a person's candidate (or, with `eliminate`, eliminated) initial on cells. */
  applyCandidate(cells: readonly CellKey[], person: PersonId, eliminate?: boolean): boolean;
  applyHighlight(cells: readonly CellKey[], color: ColorId | null): boolean;
  /**
   * Wipe cells clean: marks, candidate initials, highlights and pencil guesses
   * (one undo step). Real placements stay; they have their own remove action.
   */
  clearCellAnnotations(cells: readonly CellKey[]): boolean;
  /**
   * Apply the ACTIVE tool to cells (cross/dot/unsure/eliminate/highlight/erase;
   * pencil uses the first cell). Place and the candidate notes it makes are handled by the UI.
   */
  applyTool(cells: readonly CellKey[]): boolean;
  placeTentative(person: PersonId, cell: CellKey): TentativeResult;
  removeTentative(person: PersonId): boolean;
  /** Turn a tentative placement into a real one. */
  promoteTentative(person: PersonId): boolean;
  setRowNote(row: number, text: string): boolean;
  setColNote(col: number, text: string): boolean;
  /** Legacy: room notes have no UI since the room legend went; kept for the save format. */
  setRoomNote(room: RoomId, text: string): boolean;
  toggleClueTick(person: PersonId, atom: number): boolean;
  toggleClueStruck(person: PersonId): boolean;
  addClueHighlight(person: PersonId, start: number, end: number, color: ColorId): boolean;
  removeClueHighlight(person: PersonId, index: number): boolean;
  clearClueHighlights(person: PersonId): boolean;
  setPersonNote(person: PersonId, text: string): boolean;
  /** View preference: not undoable. */
  setLayerVisible(layer: LayerId, visible: boolean): void;
  clearLayer(layer: LayerId): boolean;
  /** Clear every annotation and tentative placement; placements stay. */
  clearAnnotations(): boolean;
  /** Clear placements, tentative placements and annotations. */
  resetEverything(): boolean;
  // ---- pen layer, logic grid, scratchpad (SPEC §6.5.5-7)
  setPen(pen: PenKind): void;
  setPenSize(size: 0 | 1 | 2): void;
  setDrawLocked(locked: boolean): void;
  /** One undo step per finished stroke. */
  addStroke(stroke: Stroke): boolean;
  /** One undo step for any number of strokes (an eraser gesture). */
  eraseStrokes(indices: readonly number[]): boolean;
  cycleLogicCell(table: LogicTable, slot: number, index: number): boolean;
  /** One undo step per call; the UI debounces and commits on blur. */
  setScratchpad(text: string): boolean;
  // ---- what-if branches (SPEC §6.5.8)
  /** Snapshot the board onto the stack; refused beyond WHATIF_MAX_DEPTH. */
  startWhatIf(): boolean;
  /** Merge: pop the snapshot, keep the current board. `note` is appended to the scratchpad. */
  keepWhatIf(note?: string): boolean;
  /** Revert the board to the snapshot and pop it. `note` is appended to the scratchpad. */
  abandonWhatIf(note?: string): boolean;
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

export function undoableOf(
  s: Pick<GameState, 'placements' | 'tentativePlacements' | 'annotations' | 'whatIfStack'>,
): Undoable {
  return {
    placements: s.placements,
    tentativePlacements: s.tentativePlacements,
    annotations: s.annotations,
    whatIfStack: s.whatIfStack,
  };
}

/** The note line appended to the scratchpad when a what-if ends. */
export function whatIfNoteLine(note: string, outcome: 'kept' | 'abandoned'): string {
  const t = note.trim();
  return t === '' ? '' : `What-if: ${t} → ${outcome}`;
}

/** Annotations from a snapshot, keeping the CURRENT layer visibility (a view setting). */
function restoreAnnotations(snapshot: Annotations, current: Annotations): Annotations {
  return snapshot.layerVisibility === current.layerVisibility
    ? snapshot
    : { ...snapshot, layerVisibility: current.layerVisibility };
}

function noTentative(): Placements {
  return emptyPlacements();
}

const hasAny = (p: Placements) => Object.values(p).some((c) => c !== null);

/** Furniture that blocks standing (SPEC §12). Uses the public board, never the solution. */
function isBlocked(puzzle: PuzzleView, cell: CellKey): boolean {
  const { r, c } = parseCellKey(cell);
  const f: FurnitureType | null = puzzle.furniture[r]?.[c] ?? null;
  return f !== null && !isOccupiable(f);
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

      /**
       * "Show where this clue allows" is an assist: count it once per person per
       * game, the first time that person is selected while the setting is on.
       */
      function countAssist(d: GameStore, person: PersonId | null): void {
        if (person === null || !d.settings.showClueAllows || d.status !== 'playing') return;
        if (d.assistedPeople.includes(person)) return;
        d.assistedPeople.push(person);
        d.assistsUsed += 1;
      }

      /**
       * Run a pure annotation helper; when it changes something, record the
       * previous state as one undo step. Returns whether anything changed.
       */
      function annotate(fn: (a: Annotations) => Annotations): boolean {
        if (!playing()) return false;
        const cur = get().annotations;
        const next = fn(cur);
        if (next === cur) return false;
        commit((d) => {
          d.annotations = next;
        });
        return true;
      }

      return {
        puzzle: null,
        status: 'idle',
        error: null,
        selectedPerson: null,
        placements: emptyPlacements(),
        tentativePlacements: noTentative(),
        annotations: emptyAnnotations(),
        whatIfStack: [],
        selection: [],
        tool: 'place',
        color: COLOR_IDS[0],
        history: emptyHistory(),
        elapsedMs: 0,
        running: false,
        checksUsed: 0,
        assistsUsed: 0,
        assistedPeople: [],
        pen: 'pen',
        penSize: 1,
        drawLocked: false,
        settings: { ...DEFAULT_SETTINGS },
        startedAt: 0,
        stats: emptyStats(),
        newBest: false,

        async newGame(seed, difficulty) {
          const mine = ++generation;
          const useSeed = seed && seed.length > 0 ? seed : makeSeed();
          set((d) => {
            // Leaving an unwon game that had a placement is an abandon (stats rules).
            if (d.status === 'playing' && hasAny(d.placements))
              d.stats = recordAbandon(d.stats, true);
            d.newBest = false;
            d.startedAt = 0;
            d.puzzle = null;
            d.status = 'generating';
            d.error = null;
            d.selectedPerson = null;
            d.placements = emptyPlacements();
            d.tentativePlacements = noTentative();
            d.annotations = emptyAnnotations();
            d.whatIfStack = [];
            d.selection = [];
            d.history = emptyHistory();
            d.elapsedMs = 0;
            d.running = false;
            d.checksUsed = 0;
            d.assistsUsed = 0;
            d.assistedPeople = [];
          });
          try {
            const puzzle = await client.generate(useSeed, difficulty);
            if (mine !== generation) return;
            set((d) => {
              d.puzzle = puzzle;
              d.status = 'playing';
              d.running = true;
              d.startedAt = Date.now();
            });
          } catch (e) {
            if (mine !== generation) return;
            set((d) => {
              d.status = 'idle';
              d.error = e instanceof Error ? e.message : String(e);
            });
          }
        },

        async resumeGame(save) {
          const mine = ++generation;
          set((d) => {
            d.puzzle = null;
            d.status = 'generating';
            d.error = null;
            d.selectedPerson = null;
            d.selection = [];
            d.running = false;
            d.newBest = false;
          });
          try {
            const puzzle = await client.generate(save.seed, save.difficulty);
            if (mine !== generation) return;
            if (puzzle.version !== save.generatorVersion)
              throw new Error('The saved game was made by a different puzzle generator.');
            const won = save.status === 'won';
            set((d) => {
              d.puzzle = puzzle;
              d.status = won ? 'won' : 'playing';
              d.running = !won;
              d.placements = save.placements;
              d.tentativePlacements = save.tentativePlacements;
              d.annotations = save.annotations;
              d.whatIfStack = save.whatIfStack;
              d.history = { past: [...save.history.past], future: [...save.history.future] };
              d.elapsedMs = save.elapsedMs;
              d.checksUsed = save.checksUsed;
              d.assistsUsed = save.assistsUsed;
              d.assistedPeople = save.assistedPeople;
              d.startedAt = save.startedAt;
            });
          } catch (e) {
            if (mine !== generation) return;
            set((d) => {
              d.status = 'idle';
              d.error = e instanceof Error ? e.message : String(e);
            });
          }
        },

        setStats(stats) {
          set((d) => {
            d.stats = stats;
          });
        },

        abandonSaved(save) {
          set((d) => {
            d.stats = recordAbandon(
              d.stats,
              save.status !== 'won' && Object.values(save.placements).some((c) => c !== null),
            );
          });
        },

        resetStats() {
          set((d) => {
            d.stats = emptyStats();
            d.newBest = false;
          });
        },

        selectPerson(person) {
          set((d) => {
            d.selectedPerson = person;
            countAssist(d, person);
          });
        },

        place(person, cell) {
          const s = get();
          if (!s.puzzle || s.status !== 'playing') return 'refused';
          if (!s.puzzle.people.some((p) => p.id === person)) return 'refused';
          const current = s.placements[person] ?? null;
          if (current === cell) return 'noop';
          if (isBlocked(s.puzzle, cell)) return 'refused';

          const occupant = s.puzzle.people.find(
            (p) => p.id !== person && s.placements[p.id] === cell,
          );
          commit((d) => {
            if (occupant) d.placements[occupant.id] = null;
            d.placements[person] = cell;
            // A real placement replaces the person's tentative one.
            d.tentativePlacements[person] = null;
            if (s.settings.autoClearCandidates)
              d.annotations = clearPersonCandidates(
                s.annotations,
                slotOf(s.puzzle!.people, person),
              );
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
              d.tentativePlacements = prev.tentativePlacements;
              d.annotations = restoreAnnotations(prev.annotations, current.annotations);
              d.whatIfStack = prev.whatIfStack;
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
              d.tentativePlacements = next.tentativePlacements;
              d.annotations = restoreAnnotations(next.annotations, current.annotations);
              d.whatIfStack = next.whatIfStack;
              ok = true;
            }
          });
          return ok;
        },

        reset() {
          if (!playing() || !(hasAny(get().placements) || hasAny(get().tentativePlacements)))
            return;
          // Recorded as a normal board change, so a reset can be undone.
          commit((d) => {
            d.placements = emptyPlacements();
            d.tentativePlacements = noTentative();
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

        async accuse(suspectId) {
          const s = get();
          if (s.status !== 'playing' || !allPlaced(s)) return null;
          const gen = generation;
          const result = await client.accuse(s.placements, suspectId);
          if (result.won && gen === generation) {
            set((d) => {
              d.status = 'won';
              d.running = false;
              const r = recordWin(d.stats, s.puzzle!.difficulty, d.elapsedMs);
              d.stats = r.stats;
              d.newBest = r.newBest;
            });
          }
          return result;
        },

        setTool(tool) {
          set((d) => {
            d.tool = tool;
          });
        },

        setColor(color) {
          set((d) => {
            d.color = color;
          });
        },

        cycleColor() {
          const next = COLOR_IDS[(COLOR_IDS.indexOf(get().color) + 1) % COLOR_IDS.length]!;
          set((d) => {
            d.color = next;
          });
          return next;
        },

        selectCells(cells, mode = 'replace') {
          set((d) => {
            d.selection = mergeSelection(d.selection, cells, mode);
          });
        },

        clearSelection() {
          if (get().selection.length === 0) return;
          set((d) => {
            d.selection = [];
          });
        },

        applyMark: (cells, mark) => annotate((a) => toggleMark(a, cells, mark)),

        applyCandidate(cells, person, eliminate = false) {
          const puzzle = get().puzzle;
          if (!puzzle) return false;
          const slot = slotOf(puzzle.people, person);
          return annotate((a) => toggleCandidate(a, cells, slot, eliminate ? 'no' : 'yes'));
        },

        applyHighlight: (cells, color) => annotate((a) => setHighlight(a, cells, color)),

        clearCellAnnotations(cells) {
          if (!playing()) return false;
          const s = get();
          const next = clearCells(s.annotations, cells);
          const inCells = new Set(cells);
          const guesses = Object.entries(s.tentativePlacements).flatMap(([id, key]) =>
            key != null && inCells.has(key) ? [Number(id)] : [],
          );
          if (next === s.annotations && guesses.length === 0) return false;
          commit((d) => {
            d.annotations = next;
            for (const id of guesses) d.tentativePlacements[id] = null;
          });
          return true;
        },

        applyTool(cells) {
          const s = get();
          switch (s.tool) {
            case 'cross':
            case 'dot':
            case 'unsure':
              return s.applyMark(cells, s.tool);
            case 'highlight':
              return s.applyHighlight(cells, s.color);
            case 'erase':
              return s.clearCellAnnotations(cells);
            case 'eliminate':
              return s.selectedPerson === null
                ? false
                : s.applyCandidate(cells, s.selectedPerson, true);
            case 'pencil': {
              const cell = cells[0];
              return s.selectedPerson === null || cell === undefined
                ? false
                : s.placeTentative(s.selectedPerson, cell) !== 'refused';
            }
            default:
              return false;
          }
        },

        placeTentative(person, cell) {
          const s = get();
          if (!s.puzzle || s.status !== 'playing') return 'refused';
          if (!s.puzzle.people.some((p) => p.id === person)) return 'refused';
          // A placed person needs no tentative guess; blocking cells are refused as for real placements.
          if (s.placements[person] != null || isBlocked(s.puzzle, cell)) return 'refused';
          const removing = s.tentativePlacements[person] === cell;
          commit((d) => {
            d.tentativePlacements[person] = removing ? null : cell;
          });
          return removing ? 'removed' : 'placed';
        },

        removeTentative(person) {
          if (!playing() || get().tentativePlacements[person] == null) return false;
          commit((d) => {
            d.tentativePlacements[person] = null;
          });
          return true;
        },

        promoteTentative(person) {
          const cell = get().tentativePlacements[person];
          if (cell == null) return false;
          return get().place(person, cell) !== 'refused';
        },

        setRowNote: (row, text) => annotate((a) => setRowNote(a, row, text)),
        setColNote: (col, text) => annotate((a) => setColNote(a, col, text)),
        setRoomNote: (room, text) => annotate((a) => setRoomNote(a, room, text)),

        toggleClueTick(person, atom) {
          const clue = get().puzzle?.clues.find((c) => c.person === person);
          if (!clue) return false;
          return annotate((a) => toggleClueTick(a, person, atom, clue.atoms.length));
        },
        toggleClueStruck: (person) => annotate((a) => toggleClueStruck(a, person)),
        addClueHighlight: (person, start, end, color) =>
          annotate((a) => addClueHighlight(a, person, start, end, color)),
        removeClueHighlight: (person, index) =>
          annotate((a) => removeClueHighlight(a, person, index)),
        clearClueHighlights: (person) => annotate((a) => clearClueHighlights(a, person)),
        setPersonNote: (person, text) => annotate((a) => setPersonNote(a, person, text)),

        setLayerVisible(layer, visible) {
          set((d) => {
            d.annotations = setLayerVisible(get().annotations, layer, visible);
          });
        },

        clearLayer(layer) {
          if (!playing()) return false;
          if (layer !== 'tentative') return annotate((a) => clearLayer(a, layer));
          if (!hasAny(get().tentativePlacements)) return false;
          commit((d) => {
            d.tentativePlacements = noTentative();
          });
          return true;
        },

        clearAnnotations() {
          if (!playing()) return false;
          const s = get();
          const next = clearAllAnnotations(s.annotations);
          if (next === s.annotations && !hasAny(s.tentativePlacements)) return false;
          commit((d) => {
            d.annotations = next;
            d.tentativePlacements = noTentative();
          });
          return true;
        },

        resetEverything() {
          if (!playing()) return false;
          const s = get();
          const next = clearAllAnnotations(s.annotations);
          if (next === s.annotations && !hasAny(s.tentativePlacements) && !hasAny(s.placements))
            return false;
          commit((d) => {
            d.annotations = next;
            d.tentativePlacements = noTentative();
            d.placements = emptyPlacements();
          });
          return true;
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
            if (patch.showClueAllows) countAssist(d, d.selectedPerson);
          });
        },

        setPen(pen) {
          set((d) => {
            d.pen = pen;
          });
        },
        setPenSize(size) {
          set((d) => {
            d.penSize = size;
          });
        },
        setDrawLocked(locked) {
          set((d) => {
            d.drawLocked = locked;
          });
        },
        addStroke: (stroke) => annotate((a) => addStroke(a, stroke)),
        eraseStrokes: (indices) => annotate((a) => removeStrokes(a, indices)),
        cycleLogicCell: (table, slot, index) =>
          annotate((a) => cycleLogicCell(a, table, slot, index)),
        setScratchpad: (text) => annotate((a) => setScratchpad(a, text)),

        startWhatIf() {
          const s = get();
          if (!playing() || s.whatIfStack.length >= WHATIF_MAX_DEPTH) return false;
          const snapshot: BoardSnapshot = {
            placements: s.placements,
            tentativePlacements: s.tentativePlacements,
            annotations: s.annotations,
          };
          commit((d) => {
            d.whatIfStack = [...s.whatIfStack, { snapshot }];
          });
          return true;
        },

        keepWhatIf(note = '') {
          const s = get();
          if (!playing() || s.whatIfStack.length === 0) return false;
          const line = whatIfNoteLine(note, 'kept');
          commit((d) => {
            d.whatIfStack = s.whatIfStack.slice(0, -1);
            d.annotations = appendScratchpadLine(s.annotations, line);
          });
          return true;
        },

        abandonWhatIf(note = '') {
          const s = get();
          const frame = s.whatIfStack[s.whatIfStack.length - 1];
          if (!playing() || !frame) return false;
          const line = whatIfNoteLine(note, 'abandoned');
          commit((d) => {
            d.placements = frame.snapshot.placements;
            d.tentativePlacements = frame.snapshot.tentativePlacements;
            d.annotations = appendScratchpadLine(
              restoreAnnotations(frame.snapshot.annotations, s.annotations),
              line,
            );
            d.whatIfStack = s.whatIfStack.slice(0, -1);
          });
          return true;
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
