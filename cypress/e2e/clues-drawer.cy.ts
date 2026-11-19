import {
  closeClues,
  openClues,
  placePerson,
  selectPerson,
  sel,
  solveByHints,
} from '../support/helpers';

const URL = '/?seed=cy-clues&d=easy';
const PLACED_KEY = 'murdoku:v1:placed-collapsed';

function load() {
  cy.visit(URL);
  cy.get(sel('board')).should('be.visible');
}

/** Free cells in distinct rows and columns, so several people can be placed without conflicts. */
function freeCells(n: number): Cypress.Chainable<[number, number][]> {
  return cy.get('[data-testid="board-grid"] [data-blocked="false"]').then(($cells) => {
    const rows = new Set<number>();
    const cols = new Set<number>();
    const out: [number, number][] = [];
    for (const el of $cells.toArray()) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      if (rows.has(r) || cols.has(c)) continue;
      rows.add(r);
      cols.add(c);
      out.push([r, c]);
      if (out.length === n) break;
    }
    return out;
  });
}

describe('clues drawer', () => {
  it('shows the victim with only the murder rule, not a clue of their own', () => {
    load();
    openClues();
    cy.get(`${sel('clues-unplaced')} [data-testid^="person-card-"]`)
      .first()
      .then(($card) => {
        const id = $card.attr('data-testid')!.replace('person-card-', '');
        cy.get(sel(`person-clue-${id}`)).should(
          'have.text',
          'Was alone in the room with the murderer.',
        );
        cy.get(`[data-testid^="clue-tick-${id}-"]`).should('not.exist');
      });
  });

  it('is open beside the board at 1280px and toggles with the Clues button and the close button', () => {
    load();
    cy.get(sel('clues-drawer')).should('be.visible');
    cy.get(sel('clues-toggle')).should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('game')).should('have.attr', 'data-clues', 'open');
    // docked: the board is not covered by the drawer
    cy.get(sel('board')).then(($b) => {
      cy.get(sel('clues-drawer')).then(($d) => {
        expect($b[0]!.getBoundingClientRect().right).to.be.at.most(
          $d[0]!.getBoundingClientRect().left,
        );
      });
    });
    cy.get(sel('clues-close')).click();
    cy.get(sel('clues-drawer')).should('not.be.visible');
    cy.get(sel('clues-toggle')).should('have.attr', 'aria-expanded', 'false');
    cy.get(sel('game')).should('have.attr', 'data-clues', 'closed');
    cy.get(sel('clues-toggle')).click();
    cy.get(sel('clues-drawer')).should('be.visible');
  });

  it('starts closed below 1200px and then overlays the board from the right', () => {
    cy.viewport(1000, 700);
    load();
    cy.get(sel('clues-drawer')).should('not.be.visible');
    cy.get(sel('clues-toggle')).should('have.attr', 'aria-expanded', 'false').click();
    cy.get(sel('clues-drawer')).should('be.visible');
    cy.get(sel('clues-drawer')).then(($d) => {
      const r = $d[0]!.getBoundingClientRect();
      expect(Math.round(r.right)).to.eq(1000);
      expect(r.left, 'overlay leaves room on the left').to.be.greaterThan(300);
    });
    cy.get(sel('clues-close')).click();
    cy.get(sel('clues-drawer')).should('not.be.visible');
  });

  it('is a bottom sheet on phones, opened from the Clues button', () => {
    cy.viewport(375, 740);
    load();
    cy.get(sel('clues-drawer')).should('not.be.visible');
    cy.get(sel('clues-toggle')).click();
    cy.get(sel('clues-drawer')).should('be.visible');
    cy.get(sel('clues-drawer')).then(($d) => {
      const r = $d[0]!.getBoundingClientRect();
      expect(Math.round(r.left)).to.eq(0);
      expect(Math.round(r.right)).to.eq(375);
      expect(Math.round(r.bottom)).to.eq(740);
      expect(r.height).to.be.within(740 * 0.5, 740 * 0.75);
    });
    cy.get(sel('person-card-0')).should('be.visible');
    cy.get(sel('clues-close')).click();
    cy.get(sel('clues-drawer')).should('not.be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(375);
    });
  });

  it('the Clues button badge counts the unplaced people', () => {
    load();
    cy.get(sel('clues-count'))
      .should('have.text', '9')
      .and('have.attr', 'aria-label', '9 unplaced');
    freeCells(2).then(([a, b]) => {
      placePerson(0, ...a!);
      cy.get(sel('clues-count')).should('have.text', '8');
      placePerson(1, ...b!);
      cy.get(sel('clues-count')).should('have.text', '7');
      cy.get(sel('undo')).click();
      cy.get(sel('clues-count')).should('have.text', '8');
    });
  });

  it('works through the phone flow: open clues, pick a person, place them', () => {
    cy.viewport(375, 740);
    load();
    freeCells(1).then(([a]) => {
      placePerson(0, ...a!);
      cy.get(`[data-testid="cell-${a![0]}-${a![1]}"]`).should('have.attr', 'data-occupant', '0');
      cy.get(sel('clues-count')).should('have.text', '8');
    });
  });
});

describe('clues: Unplaced and Placed sections', () => {
  it('shows everyone as unplaced, with no Placed section, to begin with', () => {
    load();
    cy.get(sel('clues-unplaced')).should('contain.text', 'Unplaced').and('contain.text', '(9)');
    cy.get(sel('clues-unplaced')).find('[data-testid^="person-card-"]').should('have.length', 9);
    cy.get(sel('clues-placed')).should('not.exist');
    cy.get(sel('clues-all-placed')).should('not.exist');
  });

  it('moves a placed person into Placed and updates both counts', () => {
    load();
    freeCells(2).then(([a, b]) => {
      placePerson(3, ...a!);
      placePerson(5, ...b!);
    });
    cy.get(sel('clues-unplaced')).should('contain.text', '(7)');
    cy.get(sel('clues-unplaced')).find('[data-testid^="person-card-"]').should('have.length', 7);
    cy.get(sel('clues-placed')).should('contain.text', 'Placed').and('contain.text', '(2)');
    cy.get(sel('clues-placed-list')).find('[data-testid^="person-card-"]').should('have.length', 2);
    cy.get(sel('clues-placed-list')).find(sel('person-card-3')).should('exist');
    cy.get(sel('clues-unplaced')).find(sel('person-card-3')).should('not.exist');
  });

  it('a pencil guess stays under Unplaced', () => {
    load();
    freeCells(1).then(([a]) => {
      cy.get(sel('tool-pencil')).click();
      selectPerson(2);
      cy.get(`[data-testid="cell-${a![0]}-${a![1]}"]`).click();
      cy.get(sel('person-status-2')).should('contain.text', 'Guess');
    });
    cy.get(sel('clues-unplaced')).find(sel('person-card-2')).should('exist');
    cy.get(sel('clues-placed')).should('not.exist');
    cy.get(sel('clues-count')).should('have.text', '9');
  });

  it('the Placed header collapses and expands the list (aria-expanded) and the choice survives a reload', () => {
    load();
    freeCells(1).then(([a]) => placePerson(0, ...a!));
    cy.get(sel('clues-placed-toggle')).should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('clues-placed-list')).should('be.visible');
    cy.get(sel('clues-placed-toggle')).click().should('have.attr', 'aria-expanded', 'false');
    cy.get(sel('clues-placed-list')).should('not.be.visible');
    cy.window().then((win) => expect(win.localStorage.getItem(PLACED_KEY)).to.eq('1'));
    cy.get(sel('clues-unplaced')).find('[data-testid^="person-card-"]').should('be.visible');

    cy.reload();
    cy.get(sel('board')).should('be.visible');
    cy.get(sel('clues-placed-toggle')).should('have.attr', 'aria-expanded', 'false');
    cy.get(sel('clues-placed-list')).should('not.be.visible');
    cy.get(sel('clues-placed-toggle')).click().should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('clues-placed-list')).should('be.visible');
    cy.window().then((win) => expect(win.localStorage.getItem(PLACED_KEY)).to.eq('0'));
  });

  it('the Placed toggle is a focusable button that Enter and Space operate', () => {
    load();
    freeCells(1).then(([a]) => placePerson(0, ...a!));
    cy.get(sel('clues-placed-toggle')).focus().should('have.focus');
    cy.press(Cypress.Keyboard.Keys.ENTER);
    cy.get(sel('clues-placed-toggle')).should('have.attr', 'aria-expanded', 'false');
    cy.press(Cypress.Keyboard.Keys.SPACE);
    cy.get(sel('clues-placed-toggle')).should('have.attr', 'aria-expanded', 'true');
  });

  it('shows an all-placed message once everyone is on the board', () => {
    load();
    solveByHints({ n: 0 });
    cy.get(sel('clues-all-placed')).should('be.visible');
    cy.get(sel('clues-unplaced')).should('contain.text', '(0)');
    cy.get(sel('clues-placed')).should('contain.text', '(9)');
    cy.get(sel('clues-count')).should('have.text', '0');
  });

  it('digit keys still pick the person by their place in the full list, placed or not', () => {
    load();
    // The first person in the list (the victim) goes to Placed; key 1 must still select them.
    cy.get('[data-testid^="person-card-"]')
      .first()
      .invoke('attr', 'data-testid')
      .then((first) => {
        const id = first!.replace('person-card-', '');
        freeCells(2).then(([a, b]) => {
          placePerson(id, ...a!);
          cy.get(sel('clues-placed-list'))
            .find(sel(`person-card-${id}`))
            .should('exist');
          cy.get(`[data-testid="cell-${b![0]}-${b![1]}"]`).focus();
          cy.focused().type('1');
          cy.get(sel(`person-card-${id}`)).should('have.attr', 'data-selected', 'true');
          cy.get(sel(`person-card-${id}`))
            .find('button')
            .first()
            .should('have.attr', 'aria-keyshortcuts', '1');
        });
      });
    // ... and key 2 selects the second person, who is still under Unplaced.
    cy.get('body').type('{esc}');
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').last().focus();
    cy.focused().type('2');
    cy.get(sel('clues-unplaced')).find('[data-selected="true"]').should('have.length', 1);
  });

  it('keeps the drawer usable when closed and reopened with a collapsed Placed list', () => {
    cy.viewport(1000, 700);
    load();
    freeCells(1).then(([a]) => placePerson(0, ...a!));
    openClues();
    cy.get(sel('clues-placed-toggle')).click();
    closeClues();
    openClues();
    cy.get(sel('clues-placed-toggle')).should('have.attr', 'aria-expanded', 'false');
    cy.get(sel('clues-placed-list')).should('not.be.visible');
  });
});
