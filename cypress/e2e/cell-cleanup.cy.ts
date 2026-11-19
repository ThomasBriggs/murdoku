import { cell } from '../support/helpers';

const URL = '/?seed=cy-marks&d=easy';
const tool = (t: string) => cy.get(`[data-testid="tool-${t}"]`);

/** Row-major [r, c] of cells a person can stand on. */
function freeCells(): Cypress.Chainable<[number, number][]> {
  return cy
    .get('[data-testid="board-grid"] [data-blocked="false"]')
    .then(($c) =>
      $c.toArray().map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]),
    );
}

/** Distance between the centres of an element and its cell's content box, in px. */
function offCentre($el: JQuery<HTMLElement>): { dx: number; dy: number } {
  const el = $el[0]!;
  const cellEl = el.closest<HTMLElement>('[data-r]')!;
  const a = el.getBoundingClientRect();
  const b = cellEl.getBoundingClientRect();
  const st = getComputedStyle(cellEl);
  const [bt, bl, br, bb] = [
    st.borderTopWidth,
    st.borderLeftWidth,
    st.borderRightWidth,
    st.borderBottomWidth,
  ].map(parseFloat) as [number, number, number, number];
  const midX = b.left + bl + (b.width - bl - br) / 2;
  const midY = b.top + bt + (b.height - bt - bb) / 2;
  return { dx: a.left + a.width / 2 - midX, dy: a.top + a.height / 2 - midY };
}

describe('cell clean-up and centred markers', () => {
  beforeEach(() => {
    cy.viewport(1280, 900);
    cy.visit(URL);
    cy.get('[data-testid="board"]').should('be.visible');
  });

  it('the erase tool wipes marks, initials, highlights and guesses from a cell', () => {
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      const [r2, c2] = free[1]!;
      tool('unsure').click();
      cell(r, c).click();
      tool('highlight').click();
      cell(r, c).click();
      tool('notes').click();
      cy.get('[data-testid="person-card-1"]').click();
      cell(r, c).click();
      cell(r2, c2).click();
      tool('pencil').click();
      cy.get('[data-testid="person-card-2"]').click();
      cell(r, c).click();
      cell(r, c).should('have.attr', 'data-mark', 'unsure');
      cell(r, c).should('have.attr', 'data-candidates', '1');
      cell(r, c).should('have.attr', 'data-tentative', '2');
      cell(r, c).should('have.attr', 'data-hl-color');

      tool('erase').should('have.attr', 'title').and('contain', 'R');
      tool('erase').click();
      cell(r, c).click();
      cell(r, c).should('not.have.attr', 'data-mark');
      cell(r, c).should('not.have.attr', 'data-hl-color');
      cell(r, c).should('not.have.attr', 'data-candidates');
      cell(r, c).should('not.have.attr', 'data-tentative');
      cell(r2, c2).should('have.attr', 'data-candidates', '1'); // other cells untouched
      // one undo step brings it all back
      cy.get('[data-testid="undo"]').click();
      cell(r, c).should('have.attr', 'data-mark', 'unsure');
      cell(r, c).should('have.attr', 'data-tentative', '2');
      // Delete does the same from the keyboard
      cell(r, c).focus().type('{del}');
      cell(r, c).should('not.have.attr', 'data-mark');
      cell(r, c).should('not.have.attr', 'data-tentative');
    });
  });

  it('placed and tentative tokens have a ✕ that takes them off', () => {
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      const [r2, c2] = free[3]!;
      cy.get('[data-testid="person-card-0"]').click();
      cell(r, c).click().should('have.attr', 'data-occupant', '0');
      cy.get('[data-testid="unplace-0"]').click({ force: true });
      cell(r, c).should('have.attr', 'data-occupant', '');
      cy.get('[data-testid="person-status-0"]').should('contain.text', 'Unplaced');
      cy.get('[data-testid="undo"]').click();
      cell(r, c).should('have.attr', 'data-occupant', '0');

      tool('pencil').click();
      cy.get('[data-testid="person-card-4"]').click();
      cell(r2, c2).click().should('have.attr', 'data-tentative', '4');
      cy.get('[data-testid="untentative-4"]').click({ force: true });
      cell(r2, c2).should('not.have.attr', 'data-tentative');
    });
  });

  it('centres tokens, guesses, marks and candidate initials in their cells', () => {
    freeCells().then((free) => {
      const [[r0, c0], [r1, c1], [r2, c2], [r3, c3]] = [free[0]!, free[5]!, free[10]!, free[15]!];
      cy.get('[data-testid="person-card-0"]').click();
      cell(r0, c0).click();
      tool('pencil').click();
      cy.get('[data-testid="person-card-4"]').click();
      cell(r1, c1).click();
      tool('cross').click();
      cell(r2, c2).click();
      tool('notes').click();
      for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        cy.get(`[data-testid="person-card-${id}"]`).click();
        cell(r3, c3).click();
      }
      for (const sel of [
        '[data-testid="board-grid"] [data-testid="token-0"]',
        '[data-testid="tentative-4"]',
        `[data-testid="mark-${r2}-${c2}"]`,
        `[data-testid="cands-${r3}-${c3}"]`,
      ])
        cy.get(sel).then(($el) => {
          const { dx, dy } = offCentre($el);
          expect(Math.abs(dx), `${sel} dx`).to.be.lessThan(1.5);
          expect(Math.abs(dy), `${sel} dy`).to.be.lessThan(1.5);
        });
    });
  });
});
