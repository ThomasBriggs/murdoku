// Shared Cypress helpers (plain module; import it from specs).
export const tid = (id: string) => cy.get(`[data-testid="${id}"]`);
export const sel = (id: string) => `[data-testid="${id}"]`;
export const cell = (r: number, c: number) => cy.get(sel(`cell-${r}-${c}`));

/**
 * Solve with the Hint button alone: each round asks for a hint and applies it the way a
 * player would (select the person, click the cell). Counts the hints asked on `used`.
 */
export function solveByHints(used: { n: number }, guard = 20) {
  cy.get(sel('accuse-button')).then(($accuse) => {
    if (!$accuse.prop('disabled')) return; // all nine are placed
    expect(guard, 'hint rounds left').to.be.greaterThan(0);
    cy.get(sel('hint-button')).click();
    used.n++;
    cy.get(sel('hint-panel')).then(($panel) => {
      if ($panel.attr('data-hint-kind') === 'place') {
        const id = $panel.attr('data-hint-person');
        selectPerson(id!);
        cell(Number($panel.attr('data-hint-row')), Number($panel.attr('data-hint-col'))).click();
      } else {
        cy.get(sel('hint-apply')).click(); // eliminate-only step: cross the cells out
      }
      solveByHints(used, guard - 1);
    });
  });
}

/** Accuse suspects one by one until the win dialog shows; wrong ones must say "not the murderer". */
export function accuseUntilWon(ids: string[], i = 0) {
  expect(i, 'suspects left to try').to.be.lessThan(ids.length);
  cy.get(sel(`accuse-suspect-${ids[i]}`)).check();
  cy.get(sel('accuse-confirm')).click();
  cy.get(`${sel('win-dialog')}, ${sel('accuse-result')}`).then(($el) => {
    if ($el.attr('data-testid') === 'win-dialog') return;
    expect($el.attr('data-verdict')).to.eq('suspect');
    expect($el.text()).to.contain("that's not the murderer");
    accuseUntilWon(ids, i + 1);
  });
}

/** Hint-driven playthrough of the loaded puzzle: solve, accuse, end on the win dialog. Returns hints used. */
export function playToWin(): Cypress.Chainable<number> {
  const used = { n: 0 };
  solveByHints(used);
  cy.get(sel('accuse-button')).should('be.enabled').click();
  cy.get('[data-testid^="accuse-suspect-"]').should('have.length', 8);
  cy.get('[data-testid^="accuse-suspect-"]').then(($r) => {
    const ids = $r.toArray().map((el) => el.dataset.testid!.replace('accuse-suspect-', ''));
    accuseUntilWon(ids);
  });
  cy.get(sel('win-dialog')).should('be.visible');
  return cy.then(() => used.n);
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

/** Open the desktop overflow menu or the mobile More sheet, unless it is already open. */
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
  cy.get(sel(`person-card-${id}`)).find('button').first().click();
  cy.window().then((win) => {
    if (win.innerWidth < 1200) closeClues();
  });
}

/** Place a person by selecting their card and clicking a cell. */
export function placePerson(id: number | string, r: number, c: number) {
  selectPerson(id);
  cy.get(sel(`cell-${r}-${c}`)).click();
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

/** Open the furniture key (behind the Key toggle), unless it already is. */
export function openKey() {
  cy.get('body').then(($b) => {
    if (!$b.find(sel('furniture-legend')).length) cy.get(sel('key-toggle')).click();
  });
  cy.get(sel('furniture-legend')).should('be.visible');
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
