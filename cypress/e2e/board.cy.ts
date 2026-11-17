const URL = '/?seed=cy-board&d=easy';

/** Row-major list of [r, c] for cells matching a blocked flag. */
function cellsWhere(blocked: 'true' | 'false'): Cypress.Chainable<[number, number][]> {
  return cy
    .get(`[data-testid="board-grid"] [data-blocked="${blocked}"]`)
    .then(($cells) =>
      $cells
        .toArray()
        .map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]),
    );
}

const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);

function loadBoard() {
  cy.visit(URL);
  cy.get('[data-testid="board"]').should('be.visible');
}

describe('board', () => {
  it('renders 81 labelled cells and the people panel', () => {
    loadBoard();
    cy.get('[role="gridcell"]').should('have.length', 81);
    cy.get('[data-testid^="person-card-"]').should('have.length', 9);
    cy.get('[data-testid="person-card-0"], [data-testid^="person-card-"]')
      .first()
      .should('contain.text', 'Victim');
    cy.get('[data-testid="cell-2-3"]')
      .invoke('attr', 'aria-label')
      .should('match', /^Row 3, column D,/);
  });

  it('places, moves, undoes and redoes a person', () => {
    loadBoard();
    cellsWhere('false').then((free) => {
      const [a, b] = [free[0]!, free.find(([r, c]) => r !== free[0]![0] && c !== free[0]![1])!];
      cy.get('[data-testid="person-card-0"]').click().should('have.attr', 'data-selected', 'true');
      cell(...a).click();
      cy.get('[data-testid="board"] [data-testid="token-0"]').should('exist');
      cell(...a).should('have.attr', 'data-occupant', '0');
      // move: click the token's cell to select, then a new free cell
      cell(...a).click();
      cell(...b).click();
      cell(...b).should('have.attr', 'data-occupant', '0');
      cell(...a).should('have.attr', 'data-occupant', '');
      cy.get('[data-testid="undo"]').click();
      cell(...a).should('have.attr', 'data-occupant', '0');
      cy.get('[data-testid="redo"]').click();
      cell(...b).should('have.attr', 'data-occupant', '0');
      cy.get('[data-testid="person-status-0"]').should('contain.text', 'Placed');
    });
  });

  it('refuses blocking cells', () => {
    loadBoard();
    cellsWhere('true').then((blocked) => {
      cy.get('[data-testid="person-card-0"]').click();
      cell(...blocked[0]!).click();
      cell(...blocked[0]!).should('have.attr', 'data-occupant', '');
      cy.get('[data-testid="board"] [data-testid="token-0"]').should('not.exist');
    });
  });

  it('shows auto-crosses and conflict markers for two people in one row', () => {
    loadBoard();
    cellsWhere('false').then((free) => {
      const [r, c1] = free[0]!;
      const second = free.find(([rr, cc]) => rr === r && cc !== c1);
      expect(second, 'a second free cell in the same row').to.not.equal(undefined);
      cy.get('[data-testid="person-card-0"]').click();
      cell(r, c1).click();
      cy.get('[data-autocross="true"]').should('have.length.greaterThan', 0);
      cy.get('[data-testid="person-card-1"]').click();
      cell(...second!).click();
      cy.get('[data-testid="conflict-badge-0"]').should('be.visible');
      cy.get('[data-testid="conflict-badge-1"]').should('be.visible');
    });
  });

  it('resets through the confirm dialog', () => {
    loadBoard();
    cellsWhere('false').then((free) => {
      cy.get('[data-testid="person-card-0"]').click();
      cell(...free[0]!).click();
      cy.get('[data-testid="reset"]').click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[data-testid="cancel-reset"]').click();
      cy.get('[data-testid="board"] [data-testid="token-0"]').should('exist');
      cy.get('[data-testid="reset"]').click();
      cy.get('[data-testid="confirm-reset"]').click();
      cy.get('[role="dialog"]').should('not.exist');
      cy.get('[data-testid="board"] [data-testid="token-0"]').should('not.exist');
    });
  });

  it('places with the keyboard', () => {
    loadBoard();
    cellsWhere('false').then((free) => {
      const [r, c] = free[0]!;
      cell(r, c).focus();
      cy.focused().type('1');
      cy.focused().type('{enter}');
      cy.get('[data-testid="board"] [data-testid^="token-"]').should('have.length', 1);
      cell(r, c).should('not.have.attr', 'data-occupant', '');
      cy.focused().type('{rightarrow}');
      cy.focused().should('have.attr', 'data-testid', `cell-${r}-${c + 1}`);
    });
  });

  it('shows a room legend that highlights cells on hover', () => {
    loadBoard();
    cy.get('[data-testid="room-legend"] li').should('have.length.greaterThan', 2);
    cy.get('[data-testid^="legend-room-"]').first().trigger('mouseover').trigger('mouseenter');
    cy.get('[data-highlight="true"]').should('have.length.greaterThan', 0);
  });

  it('highlights cells when hovering a clue room word', () => {
    loadBoard();
    cy.get('[data-testid^="clue-room-"]').first().trigger('mouseover').trigger('mouseenter');
    cy.get('[data-highlight="true"]').should('have.length.greaterThan', 0);
  });

  it('fits a mobile viewport without horizontal scroll', () => {
    cy.viewport(375, 740);
    loadBoard();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('[data-testid="board-grid"]').should('be.visible');
    cy.get('[data-testid="board-grid"]').then(($g) => {
      const r = $g[0]!.getBoundingClientRect();
      expect(r.left).to.be.at.least(0);
      expect(r.right).to.be.at.most(375);
      expect(Math.abs(r.width - r.height)).to.be.lessThan(2);
    });
  });
});
