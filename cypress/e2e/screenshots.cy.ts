// Visual review shots. Cypress's Electron screenshot capture hangs in some headless
// setups, so these only run on request:
//   cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts
const URL = '/?seed=cy-board&d=easy';
const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);

const suite = Cypress.expose('SCREENSHOTS') ? describe : describe.skip;
suite('board screenshots', () => {
  for (const [name, w, h] of [
    ['desktop', 1280, 900],
    ['mobile', 375, 740],
  ] as const)
    for (const theme of ['light', 'dark'] as const)
      it(`${name} ${theme}`, () => {
        cy.viewport(w, h);
        cy.visit(URL);
        cy.get('[data-testid="board"]').should('be.visible');
        cy.get('[data-testid="settings-button"]').click();
        cy.get(`[data-testid="theme-${theme}"]`).check();
        cy.get('[data-testid="settings-button"]').click();
        cy.get('[data-testid="board-grid"] [data-blocked="false"]').then(($cells) => {
          const free = $cells
            .toArray()
            .map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]);
          const used = new Set<number>();
          let n = 0;
          for (const [r, c] of free) {
            if (n >= 3) break;
            if (used.has(r)) continue;
            used.add(r);
            cy.get(`[data-testid="person-card-${n}"]`).click();
            cell(r, c).click();
            n++;
          }
        });
        cy.get('[data-testid^="clue-room-"]').first().trigger('mouseover').trigger('mouseenter');
        cy.screenshot(`board-${name}-${theme}`, { capture: 'fullPage' });
      });
});
