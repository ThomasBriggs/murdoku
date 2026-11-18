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
        cy.get(sel(`person-card-${id}`)).click();
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
