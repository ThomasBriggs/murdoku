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

suite('toolkit screenshots', () => {
  for (const [name, w, h, theme] of [
    ['desktop', 1280, 900, 'light'],
    ['mobile', 375, 740, 'dark'],
  ] as const)
    it(`toolkit ${name} ${theme}`, () => {
      cy.viewport(w, h);
      cy.visit('/?seed=cy-marks&d=easy');
      cy.get('[data-testid="board"]').should('be.visible');
      cy.get('[data-testid="settings-button"]').click();
      cy.get(`[data-testid="theme-${theme}"]`).check();
      cy.get('[data-testid="settings-button"]').click();
      // crosses, dots and a question mark
      cy.get('[data-testid="tool-cross"]').click();
      for (const [r, c] of [
        [0, 0],
        [0, 1],
        [1, 4],
        [5, 5],
      ])
        cell(r!, c!).click();
      cy.get('[data-testid="tool-dot"]').click();
      cell(2, 2).click();
      cy.get('[data-testid="tool-unsure"]').click();
      cell(3, 3).click();
      // highlights in three colours
      for (const [colour, cells] of [
        [
          'amber',
          [
            [4, 0],
            [4, 1],
            [4, 2],
          ],
        ],
        [
          'blue',
          [
            [6, 6],
            [6, 7],
          ],
        ],
        [
          'green',
          [
            [8, 2],
            [7, 2],
          ],
        ],
      ] as const) {
        cy.get(`[data-testid="color-${colour}"]`).click();
        for (const [r, c] of cells) cell(r, c).click();
      }
      // candidates and an eliminated initial
      cy.get('[data-testid="tool-notes"]').click();
      for (const id of [1, 2, 3]) {
        cy.get(`[data-testid="person-card-${id}"]`).click();
        for (const [r, c] of [
          [2, 6],
          [2, 7],
          [7, 0],
        ])
          cell(r!, c!).click();
      }
      cell(2, 6).click({ shiftKey: true });
      cy.get('[data-testid="person-card-2"]').click();
      cell(7, 0).click({ shiftKey: true });
      // a tentative guess
      cy.get('[data-testid="tool-pencil"]').click();
      cy.get('[data-testid="person-card-4"]').click();
      cell(1, 7).click();
      // margin notes
      cy.get('[data-testid="row-note-3"]').type('B/D{enter}');
      cy.get('[data-testid="col-note-1"]').type('C{enter}');
      cy.get('[data-testid^="room-note-btn-"]').first().click();
      cy.get('[data-testid^="room-note-input-"]').type('victim + 1{enter}');
      cy.get('[data-testid="tool-place"]').click();
      cy.screenshot(`toolkit-${name}-${theme}`, { capture: 'fullPage' });
    });
});
