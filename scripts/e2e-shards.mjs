// Splits the Cypress specs into balanced shards (greedy longest-first bin packing).
// CLI: node scripts/e2e-shards.mjs <index> <total>  (index is 1-based)
// Prints that shard's specs comma-separated, ready for `cypress run --spec`.
import { readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Approximate seconds per spec (Firefox, measured locally). Update when specs change. */
export const WEIGHTS = {
  'a11y.cy.ts': 52,
  'persistence.cy.ts': 21,
  'clues-drawer.cy.ts': 15,
  'game-flow.cy.ts': 11,
  'toolkit-marks.cy.ts': 13,
  'dock.cy.ts': 10,
  'toolkit-advanced.cy.ts': 8,
  'board.cy.ts': 6,
  'cell-cleanup.cy.ts': 5,
  'scratchpad.cy.ts': 4,
  'pwa.cy.ts': 6,
  'dialogs.cy.ts': 2,
  'header-menu.cy.ts': 2,
  'layout.cy.ts': 2,
  'people-hover.cy.ts': 1,
  'worker.cy.ts': 1,
  'smoke.cy.ts': 1,
};
export const DEFAULT_WEIGHT = 5;
/** Skipped without SCREENSHOTS=1 and would only add a browser start. */
export const EXCLUDED = ['screenshots.cy.ts'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const specDir = join(root, 'cypress', 'e2e');

/** @returns {string[]} spec paths relative to the repo root, posix style, sorted */
export function listSpecs() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.cy.ts')) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(specDir);
  return out.sort();
}

/**
 * @param {string[]} specs
 * @param {number} total
 * @returns {{ specs: string[], weight: number }[]}
 */
export function splitSpecs(specs, total) {
  const base = (p) => p.slice(p.lastIndexOf('/') + 1);
  const items = specs
    .filter((p) => !EXCLUDED.includes(base(p)))
    .map((p) => ({ p, w: WEIGHTS[base(p)] ?? DEFAULT_WEIGHT }))
    .sort((a, b) => b.w - a.w || (a.p < b.p ? -1 : 1));
  const shards = Array.from({ length: total }, () => ({ specs: [], weight: 0 }));
  for (const { p, w } of items) {
    let best = shards[0];
    for (const s of shards) if (s.weight < best.weight) best = s;
    best.specs.push(p);
    best.weight += w;
  }
  for (const s of shards) s.specs.sort();
  return shards;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = Number(process.argv[2]);
  const total = Number(process.argv[3]);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total < 1 ||
    index < 1 ||
    index > total
  ) {
    console.error('usage: node scripts/e2e-shards.mjs <index 1..total> <total>');
    process.exit(2);
  }
  console.log(splitSpecs(listSpecs(), total)[index - 1].specs.join(','));
}
