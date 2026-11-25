import {
  openClues,
  pickTool,
  placePerson,
  sel,
  selectPerson,
  solveFromSeed,
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

  for (const [w, h] of [
    [1280, 900],
    [1000, 700],
  ]) {
    it(`is always docked beside the board at ${w}x${h}, with no toggle`, () => {
      cy.viewport(w, h);
      load();
      cy.get(sel('clues-toggle')).should('not.exist');
      cy.get(sel('clues-close')).should('not.exist');
      cy.get(sel('clues-drawer')).should('be.visible');
      cy.get(sel('board')).then(($b) => {
        cy.get(sel('clues-drawer')).then(($d) => {
          const board = $b[0]!.getBoundingClientRect();
          const drawer = $d[0]!.getBoundingClientRect();
          expect(Math.round(drawer.right), 'drawer is at the right edge').to.eq(w);
          expect(board.right, 'board clear of the drawer').to.be.at.most(drawer.left);
          // the Check / Accuse group sits between the board and the drawer
          for (const id of ['check-button', 'accuse-button']) {
            cy.get(sel(id)).then(($x) => {
              const r = $x[0]!.getBoundingClientRect();
              expect(r.left, `${id} clear of the board`).to.be.at.least(board.right);
              expect(r.right, `${id} clear of the drawer`).to.be.at.most(drawer.left);
            });
          }
        });
      });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(w);
      });
    });
  }

  it('stays docked on a landscape phone (844x390) with no horizontal scroll', () => {
    cy.viewport(844, 390);
    load();
    cy.get(sel('clues-drawer')).should('be.visible');
    cy.get(sel('board')).then(($b) => {
      cy.get(sel('clues-drawer')).then(($d) => {
        expect($b[0]!.getBoundingClientRect().right).to.be.at.most(
          $d[0]!.getBoundingClientRect().left,
        );
      });
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(844);
    });
  });

  for (const [w, h] of [
    [375, 740],
    [375, 667],
  ]) {
    it(`on a phone (${w}x${h}) the clues are their own scrolling section below the board`, () => {
      cy.viewport(w, h);
      load();
      cy.get(sel('clues-toggle')).should('not.exist');
      cy.get(sel('clues-drawer')).should('be.visible');
      cy.get(sel('board')).then(($b) => {
        cy.get(sel('clues-drawer')).then(($d) => {
          cy.get(sel('mobile-dock')).then(($dock) => {
            const board = $b[0]!.getBoundingClientRect();
            const drawer = $d[0]!.getBoundingClientRect();
            const dock = $dock[0]!.getBoundingClientRect();
            expect(drawer.top, 'below the board').to.be.at.least(board.bottom - 1);
            expect(drawer.bottom, 'above the dock').to.be.at.most(dock.top + 1);
            expect(drawer.height, 'room for clues').to.be.at.least(100);
          });
        });
      });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(w);
        expect(doc.documentElement.scrollHeight, 'the page itself does not scroll').to.be.at.most(
          h,
        );
      });
      cy.get(`${sel('clues-body')}`).then(($body) => {
        expect($body[0]!.scrollHeight, 'the clue list scrolls').to.be.greaterThan(
          $body[0]!.clientHeight,
        );
      });
      cy.get(sel('board')).then(($b) => {
        const top = $b[0]!.getBoundingClientRect().top;
        cy.get(`${sel('clues-body')}`).scrollTo('bottom', {
          ensureScrollable: false,
        });
        cy.get(`${sel('clues-body')}`).should(($body) => {
          expect($body[0]!.scrollTop).to.be.greaterThan(0);
        });
        cy.get(sel('board')).then(($b2) => {
          expect($b2[0]!.getBoundingClientRect().top, 'board did not move').to.eq(top);
        });
        cy.window().its('scrollY').should('eq', 0);
      });
    });
  }

  it('the drawer heading badge counts the unplaced people', () => {
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

  it('works through the phone flow: pick a person in the clue list, place them', () => {
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
      selectPerson(2);
      pickTool('pencil');
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
    solveFromSeed();
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
});
