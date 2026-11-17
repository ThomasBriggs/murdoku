import type { Cell } from './types';

/** Canonical placement string: "r,c;r,c;..." in PersonId order (rows/columns 0-based). */
export function canonicalPlacement(cellOf: readonly Cell[]): string {
  return cellOf.map((c) => `${c.r},${c.c}`).join(';');
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex of seed + canonical placement (SPEC §7.4). Works in Node >= 20, browsers and workers. */
export function solutionHash(seed: string, cellOf: readonly Cell[]): Promise<string> {
  return sha256Hex(`${seed}|${canonicalPlacement(cellOf)}`);
}

/** Alias for the UI: hash a player's complete placement to compare with `PuzzleView.solutionHash`. */
export const hashPlacement = solutionHash;
