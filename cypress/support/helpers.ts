// Shared Cypress helpers (plain module; import it from specs).
import { generatePuzzle } from '../../src/engine/generator';
import type { Cell, Difficulty } from '../../src/engine/types';
import { QUICK_ITEMS } from '../../src/state/store';
import { HOLD_MS } from '../../src/ui/hold';

export const tid = (id: string) => cy.get(`[data-testid="${id}"]`);
export const sel = (id: string) => `[data-testid="${id}"]`;
export const cell = (r: number, c: number) => cy.get(sel(`cell-${r}-${c}`));

/**
 * The loaded puzzle's solution, worked out in the test from the seed and difficulty shown in
 * the header. Test code only: the app itself never receives the solution (SPEC §7).
 */
export function solutionOfLoaded(): Cypress.Chainable<Cell[]> {
  return cy.get(sel('puzzle-seed')).then(($seed) =>
    cy.get(sel('puzzle-difficulty')).then(($d) => {
      const d = $d.text().trim().toLowerCase() as Difficulty;
      return generatePuzzle($seed.text().trim(), d).solution.cellOf;
    }),
  );
}

/** Place everyone at their solution cell the way a player would (select, click the cell). */
export function solveFromSeed() {
  solutionOfLoaded().then((cells) => {
    cells.forEach((c, id) => placePerson(id, c.r, c.c));
  });
  cy.get(sel('accuse-button')).should('be.enabled');
}

/**
 * Playthrough of the loaded puzzle: solve from the seed, open Accuse (which names the one person
 * alone with the victim), confirm, and end on the win dialog.
 */
export function playToWin() {
  solveFromSeed();
  cy.get(sel('accuse-button')).should('be.enabled').click();
  cy.get(sel('puzzle-seed')).then(($seed) =>
    cy.get(sel('puzzle-difficulty')).then(($d) => {
      const d = $d.text().trim().toLowerCase() as Difficulty;
      const murderer = generatePuzzle($seed.text().trim(), d).solution.murdererId;
      cy.get(sel('accuse-suspect')).should('have.attr', 'data-person', String(murderer));
    }),
  );
  cy.get(sel('accuse-confirm')).click();
  cy.get(sel('win-dialog')).should('be.visible');
}

/** Pointer gesture over the drawing layer; points are fractions (0..1) of the layer's box. */
export function gesture(points: [number, number][]) {
  cy.get(sel('drawing-layer')).then(($l) => {
    const rect = $l[0]!.getBoundingClientRect();
    const at = ([x, y]: [number, number]) => ({
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
      pointerId: 1,
      button: 0,
      force: true,
    });
    cy.wrap($l).trigger('pointerdown', at(points[0]!));
    for (const p of points.slice(1)) cy.wrap($l).trigger('pointermove', at(p));
    cy.wrap($l).trigger('pointerup', at(points[points.length - 1]!));
  });
}

/**
 * Visit with these items pinned to the quick bar (default: everything), as if chosen in
 * Settings. Specs that drive many tools or their keys use this; others keep the default bar.
 */
export function visitWithQuickBar(url: string, items: readonly string[] = QUICK_ITEMS) {
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.setItem('murdoku:v1:settings', JSON.stringify({ quickBar: items }));
    },
  });
}

/** Pick a tool from the quick bar, or from the tray when it is not pinned there. */
export function pickTool(id: string) {
  cy.get(sel('board')).should('be.visible');
  cy.get('body').then(($b) => {
    if (!$b.find(sel(`tool-${id}`)).filter(':visible').length) openMore();
    cy.get(sel(`tool-${id}`))
      .filter(':visible')
      .click();
  });
}

/** Open the tray (desktop dock menu or mobile sheet), unless it is already open. */
export function openMore() {
  cy.get('body').then(($b) => {
    if ($b.find(sel('overflow-menu')).length || $b.find(sel('more-sheet')).length) return;
    cy.get(sel($b.find(sel('overflow-button')).length ? 'overflow-button' : 'more-button')).click();
  });
}

/** Click a secondary action (Reset, Layers, Clear, What-if, Logic grid, Print), opening the menu first. */
export function moreClick(id: string) {
  openMore();
  cy.get(sel(id)).click();
}

/** Is the clue drawer showing (it is `hidden` when closed)? */
const cluesShown = ($b: JQuery<HTMLElement>) => $b.find(sel('clues-drawer')).is(':visible');

/** Open the clue drawer (open by default at >=1200px, closed below), unless it already is. */
export function openClues() {
  cy.get('body').then(($b) => {
    if (!cluesShown($b)) cy.get(sel('clues-toggle')).click();
  });
  cy.get(sel('clues-drawer')).should('be.visible');
}

/** Close the clue drawer when it is showing. */
export function closeClues() {
  cy.get('body').then(($b) => {
    if (cluesShown($b)) cy.get(sel('clues-close')).click();
  });
  cy.get(sel('clues-drawer')).should('not.be.visible');
}

/**
 * Select a person by clicking their clue card. Opens the drawer if needed and, where the drawer
 * is an overlay that would cover the board (below 1200px), closes it again afterwards.
 */
export function selectPerson(id: number | string) {
  openClues();
  // Click the name button: the card centre can land on a clue word, which doesn't select.
  cy.get(sel(`person-card-${id}`))
    .find('button')
    .first()
    .click();
  cy.window().then((win) => {
    if (win.innerWidth < 1200) closeClues();
  });
}

/**
 * Press and hold a cell (the Place tool commits a placement this way; a quick tap only notes a
 * candidate). Pointer events bubble to the window, where the board ends the press.
 */
export function longPress(r: number, c: number) {
  const opts = { button: 0, pointerId: 1, isPrimary: true, force: true };
  cy.get(sel(`cell-${r}-${c}`)).trigger('pointerdown', opts);
  cy.wait(HOLD_MS + 80);
  cy.get(sel(`cell-${r}-${c}`)).trigger('pointerup', opts);
}

/** Place a person by selecting their card and pressing and holding a cell. */
export function placePerson(id: number | string, r: number, c: number) {
  selectPerson(id);
  longPress(r, c);
}

/** Open the Settings popover in the header (idempotent). */
export function openSettings() {
  cy.get('body').then(($b) => {
    if (!$b.find(sel('settings-popover')).length) cy.get(sel('settings-button')).click();
  });
  cy.get(sel('settings-popover')).should('be.visible');
}

/** Close the Settings popover if it is open. */
export function closeSettings() {
  cy.get('body').then(($b) => {
    if ($b.find(sel('settings-popover')).length) cy.get(sel('settings-button')).click();
  });
  cy.get(sel('settings-popover')).should('not.exist');
}

/** Toggle a Settings checkbox to the wanted state (opens and closes the popover). */
export function setSetting(id: string, on: boolean) {
  openSettings();
  cy.get(sel(id))[on ? 'check' : 'uncheck']();
  closeSettings();
}

/** Open the furniture key (a collapsible section at the foot of the clue drawer). */
export function openKey() {
  openClues();
  cy.get('body').then(($b) => {
    if (!$b.find(sel('furniture-legend')).length) cy.get(sel('key-toggle')).click();
  });
  cy.get(sel('furniture-legend')).scrollIntoView().should('be.visible');
}

/** Run axe on the page (or a context) and fail with a readable list of violations. */
export function checkA11y(context?: string) {
  // Entrance animations (e.g. a card fading in) make colours transient; axe must see the settled page.
  cy.window().should((win) => {
    const running = win.document
      .getAnimations()
      .filter(
        (a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
      );
    expect(running, 'running animations').to.have.length(0);
  });
  cy.injectAxe();
  cy.checkA11y(
    context ?? undefined,
    {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    },
    (violations) => {
      const msg = violations
        .map(
          (v) =>
            `${v.id} [${v.impact}] ${v.help}\n` +
            v.nodes
              .slice(0, 6)
              .map(
                (n) =>
                  `    ${n.target.join(' ')}  ${(n.any[0]?.message ?? n.failureSummary ?? '').split('\n')[0]}`,
              )
              .join('\n'),
        )
        .join('\n');
      cy.task('log', `AXE VIOLATIONS:\n${msg}`);
    },
  );
}

/** Pick a theme through the header's Settings popover, then close it again. */
export function setTheme(theme: 'light' | 'dark') {
  openSettings();
  cy.get(sel(`theme-${theme}`)).check();
  closeSettings();
}
