// Visual review shots. Cypress's Electron screenshot capture hangs in some headless
// setups, so these only run on request:
//   cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts
const URL = '/?seed=cy-board&d=easy';
const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);

/** On mobile widths the less-used controls live in the "More" sheet. */
function inMore(w: number, action: () => void) {
  if (w > 600) return action();
  cy.get('[data-testid="more-button"]').click();
  action();
  cy.get('body').then(($b) => {
    if ($b.find('[data-testid="more-close"]').length) cy.get('[data-testid="more-close"]').click();
  });
}

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
        inMore(w, () => {
          cy.get('[data-testid="settings-button"]').click();
          cy.get(`[data-testid="theme-${theme}"]`).check();
          cy.get('[data-testid="settings-button"]').click();
        });
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
      inMore(w, () => {
        cy.get('[data-testid="settings-button"]').click();
        cy.get(`[data-testid="theme-${theme}"]`).check();
        cy.get('[data-testid="settings-button"]').click();
      });
      // crosses, dots and a question mark
      cy.get('[data-testid="tool-cross"]').click();
      for (const [r, c] of [
        [0, 0],
        [0, 1],
        [1, 4],
        [5, 5],
      ])
        cell(r!, c!).click();
      inMore(w, () => cy.get('[data-testid="tool-dot"]').click());
      cell(2, 2).click();
      inMore(w, () => cy.get('[data-testid="tool-unsure"]').click());
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
        cy.get('[data-testid="tool-highlight"]').click();
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

function setTheme(w: number, theme: 'light' | 'dark') {
  inMore(w, () => {
    cy.get('[data-testid="settings-button"]').click();
    cy.get(`[data-testid="theme-${theme}"]`).check();
    cy.get('[data-testid="settings-button"]').click();
  });
}

function logicMarks() {
  for (const [t, s, i, n] of [
    ['rooms', 0, 0, 2],
    ['rooms', 0, 1, 1],
    ['rooms', 0, 2, 1],
    ['rooms', 1, 1, 2],
    ['rooms', 2, 0, 1],
    ['rows', 0, 3, 2],
    ['rows', 1, 0, 1],
    ['cols', 2, 4, 2],
    ['cols', 3, 4, 1],
  ] as const)
    for (let k = 0; k < n; k++) cy.get(`[data-testid="logic-${t}-${s}-${i}"]`).click();
}

suite('advanced toolkit screenshots', () => {
  it('logic grid desktop light', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(1280, 'light');
    cy.get('body').type('g');
    logicMarks();
    cy.get('[data-testid="logic-grid"]').scrollIntoView();
    cy.screenshot('logic-grid-desktop-light', { capture: 'fullPage' });
  });

  it('pen drawing and what-if banner desktop dark', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(1280, 'dark');
    cy.get('body').type('w');
    cy.get('[data-testid="person-card-1"]').click();
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').first().click();
    cy.get('body').type('d');
    const stroke = (pts: [number, number][]) =>
      cy.get('[data-testid="drawing-layer"]').then(($l) => {
        const rect = $l[0]!.getBoundingClientRect();
        const at = ([x, y]: [number, number]) => ({
          clientX: rect.left + rect.width * x,
          clientY: rect.top + rect.height * y,
          pointerId: 1,
          button: 0,
          force: true,
        });
        cy.wrap($l).trigger('pointerdown', at(pts[0]!));
        for (const p of pts.slice(1)) cy.wrap($l).trigger('pointermove', at(p));
        cy.wrap($l).trigger('pointerup', at(pts[pts.length - 1]!));
      });
    cy.get('[data-testid="color-red"]').click();
    // a circle around a few cells, then an arrow
    const circle: [number, number][] = Array.from({ length: 25 }, (_, i) => [
      0.3 + 0.16 * Math.cos((i / 24) * 2 * Math.PI),
      0.35 + 0.12 * Math.sin((i / 24) * 2 * Math.PI),
    ]);
    stroke(circle);
    cy.get('[data-testid="color-blue"]').click();
    stroke([
      [0.5, 0.75],
      [0.7, 0.62],
      [0.65, 0.64],
      [0.7, 0.62],
      [0.69, 0.68],
    ]);
    cy.get('[data-testid="pen-highlighter"]').click();
    cy.get('[data-testid="color-amber"]').click();
    stroke([
      [0.1, 0.9],
      [0.6, 0.9],
    ]);
    cy.get('body').type('{esc}');
    cy.screenshot('pen-whatif-desktop-dark', { capture: 'fullPage' });
  });

  it('logic grid sheet mobile light', () => {
    cy.viewport(375, 740);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(375, 'light');
    inMore(375, () => cy.get('[data-testid="logic-toggle"]').click());
    cy.get('[data-testid="logic-grid"]').should('be.visible');
    logicMarks();
    cy.get('[data-testid="logic-grid"]').scrollTo('top');
    cy.screenshot('logic-grid-mobile-light', { capture: 'viewport' });
  });
});
