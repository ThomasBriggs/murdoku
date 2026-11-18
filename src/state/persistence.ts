/**
 * localStorage persistence (SPEC §8): the current game, settings, stats and the
 * "rules seen" flag.
 *
 * Every storage access is wrapped in try/catch, so private mode, a full quota or
 * disabled storage never breaks the game; it just doesn't persist.
 *
 * The saved game holds only the seed, generator version and player-authored state.
 * It never holds the PuzzleView or anything from the solution (SPEC §7.3): on load the
 * worker regenerates the puzzle from the seed.
 *
 * View state that is NOT saved (resets on load): selected person, active tool and colour,
 * pen kind/size/lock, multi-selection. Layer visibility lives inside the annotations, so it
 * is saved with the game. Preferences that should outlive a game are in Settings.
 */
import type { StoreApi } from 'zustand/vanilla';
import { PEOPLE } from '../engine/constants';
import type { CellKey, Difficulty, PersonId } from '../engine/types';
import { hydrateAnnotations, type Annotations } from './annotations';
import {
  DEFAULT_SETTINGS,
  type GameStore,
  type Placements,
  type Settings,
  type Theme,
  type Undoable,
  type WhatIfFrame,
} from './store';
import { normaliseStats, type Stats } from './stats';

export const KEY_CURRENT = 'murdoku:v1:current';
export const KEY_STATS = 'murdoku:v1:stats';
export const KEY_SETTINGS = 'murdoku:v1:settings';
export const KEY_SEEN_RULES = 'murdoku:v1:seenRules';

/** Version of the saved-game layout (distinct from the generator version). */
export const SAVE_SCHEMA = 1;
export const HISTORY_SAVE_CAP = 500;
/** Serialised size above which the oldest history is dropped (never the board). */
export const SAVE_BUDGET_BYTES = 1_500_000;
export const SAVE_DEBOUNCE_MS = 500;
/** While only the timer changes, still save this often so a crash loses little time. */
export const TIMER_SAVE_INTERVAL_MS = 5000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's localStorage, or null when it is unavailable (accessing it can throw). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text == null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, text: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

function remove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------------ saved game

export interface SavedHistory {
  past: Undoable[];
  future: Undoable[];
}

export interface SavedGame {
  schema: number;
  generatorVersion: number;
  seed: string;
  difficulty: Difficulty;
  status: 'playing' | 'won';
  placements: Placements;
  tentativePlacements: Placements;
  annotations: Annotations;
  whatIfStack: WhatIfFrame[];
  history: SavedHistory;
  elapsedMs: number;
  hintsUsed: number;
  checksUsed: number;
  assistsUsed: number;
  assistedPeople: PersonId[];
  startedAt: number;
  savedAt: number;
}

/** Everything toSavedGame reads; a GameStore satisfies it. */
export type SaveSource = Pick<
  GameStore,
  | 'puzzle'
  | 'status'
  | 'placements'
  | 'tentativePlacements'
  | 'annotations'
  | 'whatIfStack'
  | 'history'
  | 'elapsedMs'
  | 'hintsUsed'
  | 'checksUsed'
  | 'assistsUsed'
  | 'assistedPeople'
  | 'startedAt'
>;

/** Only the seed and difficulty identify the puzzle; the PuzzleView itself is never stored. */
export function toSavedGame(s: SaveSource, now = Date.now()): SavedGame | null {
  if (!s.puzzle || (s.status !== 'playing' && s.status !== 'won')) return null;
  return {
    schema: SAVE_SCHEMA,
    generatorVersion: s.puzzle.version,
    seed: s.puzzle.seed,
    difficulty: s.puzzle.difficulty,
    status: s.status,
    placements: s.placements,
    tentativePlacements: s.tentativePlacements,
    annotations: s.annotations,
    whatIfStack: s.whatIfStack,
    history: { past: s.history.past, future: s.history.future },
    elapsedMs: Math.round(s.elapsedMs),
    hintsUsed: s.hintsUsed,
    checksUsed: s.checksUsed,
    assistsUsed: s.assistsUsed,
    assistedPeople: s.assistedPeople,
    startedAt: s.startedAt,
    savedAt: now,
  };
}

const EMPTY_HISTORY_JSON = '"history":{"past":[],"future":[]}';

/**
 * Serialise with the history capped to the last HISTORY_SAVE_CAP undo steps (and as many
 * redo steps), then, if still over `budget`, drop the OLDEST undo steps first, then redo
 * steps. The board, what-if stack and annotations are never dropped.
 */
export function serialiseGame(game: SavedGame, budget = SAVE_BUDGET_BYTES): string {
  const pastJson = game.history.past.slice(-HISTORY_SAVE_CAP).map((u) => JSON.stringify(u));
  const futureJson = game.history.future.slice(-HISTORY_SAVE_CAP).map((u) => JSON.stringify(u));
  const head = JSON.stringify({ ...game, history: { past: [], future: [] } });
  let total = head.length;
  for (const j of pastJson) total += j.length + 1;
  for (const j of futureJson) total += j.length + 1;
  let pi = 0;
  while (total > budget && pi < pastJson.length) total -= pastJson[pi++]!.length + 1;
  let fi = 0;
  while (total > budget && fi < futureJson.length) total -= futureJson[fi++]!.length + 1;
  // Splice the pre-serialised history in (avoids stringifying every snapshot twice).
  const history = `"history":{"past":[${pastJson.slice(pi).join(',')}],"future":[${futureJson.slice(fi).join(',')}]}`;
  return head.replace(EMPTY_HISTORY_JSON, () => history);
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** `MIGRATIONS[n]` upgrades a schema-n save to schema n+1. Empty while the schema is 1. */
export const MIGRATIONS: Record<number, Migration> = {};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function placementsOf(v: unknown): Placements | null {
  if (!isObj(v)) return null;
  const out: Placements = {};
  for (let i = 0; i < PEOPLE; i++) {
    const c = v[i];
    if (c !== null && c !== undefined && typeof c !== 'string') return null;
    out[i] = (c ?? null) as CellKey | null;
  }
  return out;
}

function framesOf(v: unknown): WhatIfFrame[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: WhatIfFrame[] = [];
  for (const f of v) {
    if (!isObj(f) || !isObj(f.snapshot)) return null;
    const placements = placementsOf(f.snapshot.placements);
    const tentativePlacements = placementsOf(f.snapshot.tentativePlacements);
    if (!placements || !tentativePlacements || !isObj(f.snapshot.annotations)) return null;
    out.push({
      snapshot: {
        placements,
        tentativePlacements,
        annotations: hydrateAnnotations(f.snapshot.annotations as Partial<Annotations>),
      },
    });
  }
  return out;
}

function undoableOf(v: unknown): Undoable | null {
  if (!isObj(v)) return null;
  const placements = placementsOf(v.placements);
  const tentativePlacements = placementsOf(v.tentativePlacements);
  const whatIfStack = framesOf(v.whatIfStack);
  if (!placements || !tentativePlacements || !whatIfStack || !isObj(v.annotations)) return null;
  return {
    placements,
    tentativePlacements,
    annotations: hydrateAnnotations(v.annotations as Partial<Annotations>),
    whatIfStack,
  };
}

function historyOf(v: unknown): SavedHistory {
  const list = (x: unknown): Undoable[] =>
    Array.isArray(x) ? x.map(undoableOf).filter((u): u is Undoable => u !== null) : [];
  const h = isObj(v) ? v : {};
  return {
    past: list(h.past).slice(-HISTORY_SAVE_CAP),
    future: list(h.future).slice(-HISTORY_SAVE_CAP),
  };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Run migrations and validate. Returns null for anything unusable (never throws). */
export function parseSavedGame(
  rawIn: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  currentSchema = SAVE_SCHEMA,
): SavedGame | null {
  try {
    if (!isObj(rawIn)) return null;
    let raw = rawIn;
    let schema = typeof raw.schema === 'number' ? raw.schema : 1;
    if (schema > currentSchema) return null; // written by a newer app
    while (schema < currentSchema) {
      const step = migrations[schema];
      if (!step) return null;
      raw = step({ ...raw });
      schema += 1;
      raw.schema = schema;
    }
    const placements = placementsOf(raw.placements);
    const tentativePlacements = placementsOf(raw.tentativePlacements);
    const whatIfStack = framesOf(raw.whatIfStack);
    const difficulty = raw.difficulty;
    if (
      !placements ||
      !tentativePlacements ||
      !whatIfStack ||
      !isObj(raw.annotations) ||
      typeof raw.seed !== 'string' ||
      raw.seed === '' ||
      (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') ||
      typeof raw.generatorVersion !== 'number'
    )
      return null;
    return {
      schema: currentSchema,
      generatorVersion: raw.generatorVersion,
      seed: raw.seed,
      difficulty,
      status: raw.status === 'won' ? 'won' : 'playing',
      placements,
      tentativePlacements,
      annotations: hydrateAnnotations(raw.annotations as Partial<Annotations>),
      whatIfStack,
      history: historyOf(raw.history),
      elapsedMs: count(raw.elapsedMs),
      hintsUsed: count(raw.hintsUsed),
      checksUsed: count(raw.checksUsed),
      assistsUsed: count(raw.assistsUsed),
      assistedPeople: Array.isArray(raw.assistedPeople)
        ? raw.assistedPeople.filter((p): p is number => typeof p === 'number')
        : [],
      startedAt: count(raw.startedAt),
      savedAt: count(raw.savedAt),
    };
  } catch {
    return null;
  }
}

export function loadCurrent(
  storage: StorageLike | null,
  migrations: Record<number, Migration> = MIGRATIONS,
  currentSchema = SAVE_SCHEMA,
): SavedGame | null {
  return parseSavedGame(read(storage, KEY_CURRENT), migrations, currentSchema);
}

export function saveCurrent(
  storage: StorageLike | null,
  game: SavedGame,
  budget?: number,
): boolean {
  try {
    return write(storage, KEY_CURRENT, serialiseGame(game, budget));
  } catch {
    return false;
  }
}

export function clearCurrent(storage: StorageLike | null): void {
  remove(storage, KEY_CURRENT);
}

// ------------------------------------------------------------------ settings, stats, rules flag

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export function loadSettings(storage: StorageLike | null): Settings {
  const raw = read(storage, KEY_SETTINGS);
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!isObj(raw)) return out;
  if (THEMES.includes(raw.theme as Theme)) out.theme = raw.theme as Theme;
  for (const k of [
    'autoCross',
    'conflictHighlight',
    'autoClearCandidates',
    'linkLogicGrid',
    'showClueAllows',
  ] as const)
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}

export function saveSettings(storage: StorageLike | null, s: Settings): void {
  write(storage, KEY_SETTINGS, JSON.stringify(s));
}

export function loadStats(storage: StorageLike | null): Stats {
  return normaliseStats(read(storage, KEY_STATS));
}

export function saveStats(storage: StorageLike | null, s: Stats): void {
  write(storage, KEY_STATS, JSON.stringify(s));
}

export function hasSeenRules(storage: StorageLike | null): boolean {
  return read(storage, KEY_SEEN_RULES) === true;
}

export function markRulesSeen(storage: StorageLike | null): void {
  write(storage, KEY_SEEN_RULES, 'true');
}

/** data-theme on <html>; 'system' removes it so the media query decides. */
export function applyTheme(theme: Theme, el: HTMLElement = document.documentElement): void {
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

/** Load settings and stats into the store and apply the theme. Call before the first render. */
export function hydrateStore(store: StoreApi<GameStore>, storage: StorageLike | null): void {
  const settings = loadSettings(storage);
  store.getState().updateSettings(settings);
  store.getState().setStats(loadStats(storage));
  applyTheme(settings.theme);
}

// ------------------------------------------------------------------ connecting the store

export interface PersistenceOptions {
  storage: StorageLike | null;
  debounceMs?: number;
  timerSaveIntervalMs?: number;
  budget?: number;
  /** Injectable for tests. */
  now?: () => number;
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden'>;
}

export interface Persistence {
  /** Save the current game now (if it has a puzzle). */
  flush(): void;
  dispose(): void;
}

/**
 * Debounced saves of the current game on every state change (timer ticks excepted, which
 * only save every few seconds), immediate saves of settings and stats, and a flush when
 * the page is hidden or unloaded.
 */
export function connectPersistence(
  store: StoreApi<GameStore>,
  opts: PersistenceOptions,
): Persistence {
  const { storage } = opts;
  const debounceMs = opts.debounceMs ?? SAVE_DEBOUNCE_MS;
  const timerEvery = opts.timerSaveIntervalMs ?? TIMER_SAVE_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const win = opts.win ?? window;
  const doc = opts.doc ?? document;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSave = now();

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const save = () => {
    cancel();
    const game = toSavedGame(store.getState(), now());
    if (game) {
      saveCurrent(storage, game, opts.budget);
      lastSave = now();
    }
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(save, debounceMs);
  };

  const unsub = store.subscribe((s, prev) => {
    if (s.settings !== prev.settings) saveSettings(storage, s.settings);
    if (s.stats !== prev.stats) saveStats(storage, s.stats);
    const changed =
      s.puzzle !== prev.puzzle ||
      s.status !== prev.status ||
      s.placements !== prev.placements ||
      s.tentativePlacements !== prev.tentativePlacements ||
      s.annotations !== prev.annotations ||
      s.whatIfStack !== prev.whatIfStack ||
      s.history !== prev.history ||
      s.hintsUsed !== prev.hintsUsed ||
      s.checksUsed !== prev.checksUsed ||
      s.assistsUsed !== prev.assistsUsed ||
      s.assistedPeople !== prev.assistedPeople;
    if (changed) schedule();
    else if (
      s.elapsedMs !== prev.elapsedMs &&
      timer === undefined &&
      now() - lastSave >= timerEvery
    )
      schedule();
  });

  const onVisibility = () => {
    if (doc.hidden) save();
  };
  win.addEventListener('pagehide', save);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    flush: save,
    dispose() {
      unsub();
      cancel();
      win.removeEventListener('pagehide', save);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
