/**
 * Lifetime statistics (SPEC §8). Pure helpers; persistence.ts stores the result.
 *
 * Rules:
 *  - A game counts as PLAYED when it ENDS: it is won, or it is abandoned (a new game is started,
 *    or the shared puzzle is chosen over it) after at least one real placement was made. A game
 *    still in progress is not counted yet, and one abandoned with only marks/notes never is.
 *  - WON counts accuse-verified wins; best time is the lowest elapsed time per difficulty.
 *  - STREAK = consecutive wins. Abandoning a game that had a placement resets it to 0; abandoning
 *    an empty game, or discarding a save from an outdated generator, does not.
 */
import type { Difficulty } from '../engine/types';

export interface Stats {
  played: number;
  won: number;
  bestTimeMs: Record<Difficulty, number | null>;
  streak: number;
  bestStreak: number;
}

export function emptyStats(): Stats {
  return {
    played: 0,
    won: 0,
    bestTimeMs: { easy: null, medium: null, hard: null },
    streak: 0,
    bestStreak: 0,
  };
}

export function recordWin(
  s: Stats,
  difficulty: Difficulty,
  elapsedMs: number,
): { stats: Stats; newBest: boolean } {
  const best = s.bestTimeMs[difficulty];
  const newBest = best === null || elapsedMs < best;
  const streak = s.streak + 1;
  return {
    newBest,
    stats: {
      played: s.played + 1,
      won: s.won + 1,
      bestTimeMs: { ...s.bestTimeMs, [difficulty]: newBest ? elapsedMs : best },
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
    },
  };
}

/** `hadPlacement`: the abandoned, unwon game had at least one real placement. */
export function recordAbandon(s: Stats, hadPlacement: boolean): Stats {
  if (!hadPlacement) return s;
  return { ...s, played: s.played + 1, streak: 0 };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const time = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Tolerant parse of stored stats: anything malformed falls back to the default. */
export function normaliseStats(raw: unknown): Stats {
  const base = emptyStats();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Record<keyof Stats, unknown>>;
  const bt = (
    typeof r.bestTimeMs === 'object' && r.bestTimeMs !== null ? r.bestTimeMs : {}
  ) as Record<string, unknown>;
  return {
    played: num(r.played),
    won: num(r.won),
    bestTimeMs: { easy: time(bt.easy), medium: time(bt.medium), hard: time(bt.hard) },
    streak: num(r.streak),
    bestStreak: num(r.bestStreak),
  };
}
