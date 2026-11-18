/**
 * What to do on page load (SPEC §8), as a pure decision so every branch is testable.
 *
 * | saved game          | URL ?seed=         | decision                                           |
 * |---------------------|--------------------|----------------------------------------------------|
 * | none                | none               | start a new random medium game                     |
 * | none                | present            | start the URL puzzle                               |
 * | generator differs   | same puzzle as save| `outdated` dialog; confirming discards the save and|
 * |                     |                    | starts the URL puzzle                              |
 * | generator differs   | other puzzle       | start the URL puzzle, discard the unusable save    |
 * | generator differs   | none               | `outdated` dialog; confirming starts a new game    |
 * | current             | none               | resume                                             |
 * | current             | same seed + diff.  | resume                                             |
 * | current, progress,  | other puzzle       | `choose` dialog: continue, or start the shared one |
 * |   not won           |                    |                                                    |
 * | current, no progress| other puzzle       | start the URL puzzle                               |
 * | current, won        | other puzzle       | start the URL puzzle                               |
 *
 * A missing `d` means medium, as everywhere else.
 */
import type { Difficulty } from '../engine/types';
import { hasProgress } from '../ui/progress';
import type { SavedGame } from './persistence';

export interface UrlPuzzle {
  seed: string;
  difficulty: Difficulty;
}

export type StartupDecision =
  | { kind: 'new'; seed?: undefined; difficulty: Difficulty; discardSave: boolean }
  | { kind: 'start'; seed: string; difficulty: Difficulty; discardSave: boolean }
  | { kind: 'resume'; save: SavedGame }
  | { kind: 'choose'; save: SavedGame; url: UrlPuzzle }
  | { kind: 'outdated'; save: SavedGame; url: UrlPuzzle | null };

export function decideStartup(
  url: UrlPuzzle | null,
  saved: SavedGame | null,
  generatorVersion: number,
): StartupDecision {
  const fresh = (discardSave: boolean): StartupDecision =>
    url
      ? { kind: 'start', seed: url.seed, difficulty: url.difficulty, discardSave }
      : { kind: 'new', difficulty: 'medium', discardSave };
  if (!saved) return fresh(false);
  const same = url !== null && url.seed === saved.seed && url.difficulty === saved.difficulty;
  if (saved.generatorVersion !== generatorVersion) {
    if (url === null || same) return { kind: 'outdated', save: saved, url };
    return fresh(true);
  }
  if (url === null || same) return { kind: 'resume', save: saved };
  if (saved.status !== 'won' && hasProgress(saved)) return { kind: 'choose', save: saved, url };
  return fresh(false);
}
