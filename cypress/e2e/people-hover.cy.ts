import { cell, tid } from '../support/helpers';

const URL = '/?seed=cy-people-hover&d=easy';
/** Mouse over/out on the card's name button (the card centre can land on a clue word instead). */
const hover = (id: string, ev: 'mouseover' | 'mouseout') =>
  tid(`person-card-${id}`).find('button').first().trigger(ev);
const tool = (t: string) => tid(`tool-${t}`);
/** Select a person via the card's name button (see `hover`). */
const pick = (id: string) => tid(`person-card-${id}`).find('button').first().click();

/** Row-major [r, c] of cells a person can stand on. */
function freeCells(): Cypress.Chainable<[number, number][]> {
  return cy
    .get('[data-testid="board-grid"] [data-blocked="false"]')
    .then(($c) =>
      $c.toArray().map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]),
    );
}

describe('people panel: placed names and hover highlights', () => {
  it('strikes through a placed name and lights up placed, pencilled and noted cells on hover', () => {
    cy.visit(URL);
    tid('board').should('be.visible');
    freeCells().then((free) => {
      const [a, b, c, d] = [free[0]!, free[10]!, free[20]!, free[30]!];

      // Person 1 placed for real.
      pick('1');
      cell(...a).click();
      tid('person-name-1').should('have.attr', 'data-placed', 'true');
      tid('person-name-1').should('have.css', 'text-decoration-line', 'line-through');
      tid('person-name-2').should('not.have.attr', 'data-placed');

      // Person 2 pencilled in at b and noted as a candidate at c and d.
      tool('pencil').click();
      pick('2');
      cell(...b).click();
      tool('notes').click();
      pick('2'); // pencil-placing deselects the person
      cell(...c)
        .click()
        .should('have.attr', 'data-candidates', '2');
      cell(...d)
        .click()
        .should('have.attr', 'data-candidates', '2');
      tool('place').click();

      hover('1', 'mouseover');
      cell(...a).should('have.attr', 'data-person-mark', 'placed');
      cy.get('[data-person-mark]').should('have.length', 1);
      hover('1', 'mouseout');

      hover('2', 'mouseover');
      cell(...b).should('have.attr', 'data-person-mark', 'tentative');
      cell(...c).should('have.attr', 'data-person-mark', 'candidate');
      cell(...d).should('have.attr', 'data-person-mark', 'candidate');
      cy.get('[data-person-mark]').should('have.length', 3);
      hover('2', 'mouseout');
      cy.get('[data-person-mark]').should('not.exist');
    });
  });
});
