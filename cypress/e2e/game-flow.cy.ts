import { cell, placePerson, solutionOfLoaded, solveFromSeed, sel as tid } from '../support/helpers';

const SEED = 'cy-flow';
const URL = `/?seed=${SEED}&d=easy`;

function load(url = URL) {
  cy.visit(url);
  cy.get(tid('board')).should('be.visible');
}

describe('game flow', () => {
  it('shows the header: difficulty, a running timer, New game and Rules', () => {
    load();
    cy.get(tid('puzzle-difficulty')).should('have.text', 'easy');
    cy.get(tid('timer')).should('have.attr', 'data-running', 'true');
    cy.get(tid('timer')).should('not.have.text', '00:00');
    cy.get(tid('rules-button')).click();
    cy.get(tid('rules-dialog')).should('contain.text', 'You can be on');
    cy.get(tid('rules-keys-playing')).should('not.contain.text', 'hint');
    cy.get(tid('rules-close')).click();
    cy.get(tid('rules-dialog')).should('not.exist');
  });

  it('has no Hint button or H shortcut', () => {
    load();
    cy.get(tid('check-button')).should('be.visible');
    cy.get(tid('hint-button')).should('not.exist');
    cy.get('body').type('h');
    cy.get(tid('hint-panel')).should('not.exist');
  });

  it('keeps Accuse disabled until everyone is placed', () => {
    load();
    cy.get(tid('accuse-button'))
      .should('be.disabled')
      .and('have.attr', 'title')
      .and('match', /Place all 9/);
    solutionOfLoaded().then((cells) => placePerson(0, cells[0]!.r, cells[0]!.c));
    cy.get(tid('accuse-button')).should('be.disabled');
  });

  it('reports correct and wrong placements with a Check', () => {
    load();
    // person 2 standing on person 1's solution cell can only be wrong
    solutionOfLoaded().then((cells) => placePerson(2, cells[1]!.r, cells[1]!.c));
    cy.get(tid('check-button')).click();
    cy.get(tid('check-text')).should('have.text', '0 correct, 1 wrong');
    cy.get('[data-testid^="wrong-badge-"]').should('not.exist');
    cy.get(tid('check-show-wrong')).check();
    cy.get('[data-testid^="wrong-badge-"]').should('have.length', 1);
  });

  it('plays a seed through, accuses and wins', () => {
    load();
    solveFromSeed();
    cy.get(tid('accuse-button')).should('be.enabled').click();
    // No list of suspects: the one person alone with the victim, and an "are you sure?"
    cy.get('[role="radio"]').should('not.exist');
    cy.get(tid('accuse-dialog')).should('contain.text', 'Are you sure');
    cy.get(tid('accuse-cancel')).click();
    cy.get(tid('accuse-dialog')).should('not.exist');
    cy.get(tid('accuse-button')).click();
    cy.get(tid('accuse-suspect'))
      .invoke('attr', 'data-person')
      .then((id) => {
        cy.get(tid('accuse-confirm')).should('contain.text', 'Accuse').click();
        cy.get(tid('win-dialog')).should('be.visible');
        cy.get(tid(`person-card-${id}`)).should('exist');
      });
    cy.get(tid('win-hints')).should('not.exist');
    cy.get(tid('win-difficulty')).should('have.text', 'easy');
    cy.get(tid('win-time'))
      .invoke('text')
      .should('match', /^\d\d:\d\d$/);
    cy.get(tid('timer')).should('have.attr', 'data-running', 'false');

    // share: copies a link with seed + difficulty
    cy.window().then((win) => {
      const stub = cy.stub().as('copy');
      stub.resolves();
      Object.defineProperty(win.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: stub },
      });
    });
    cy.get(tid('win-share')).click();
    cy.get('@copy').should('have.been.calledWithMatch', `seed=${SEED}&d=easy`);
    cy.get(tid('win-share-status')).should('contain.text', 'copied');

    // the board is read-only and shows Solved
    cy.get(tid('win-close')).click();
    cy.get(tid('solved-banner')).should('be.visible');
    cy.get(tid('board')).should('have.attr', 'data-solved', 'true');
    cy.get(tid('check-button')).should('be.disabled');
    cy.get(tid('person-card-1')).click();
    cell(0, 0).click();
    cy.get(tid('board-grid')).find('[data-occupant="1"]').should('have.length', 1);
  });

  it('starts a custom-seed game, updates the URL and survives a reload', () => {
    load();
    cy.get(tid('new-game-button')).click();
    cy.get(tid('newgame-difficulty-easy')).check();
    cy.get(tid('newgame-seed')).type('cy-flow-two');
    cy.get(tid('newgame-start')).click();
    cy.get(tid('newgame-dialog')).should('not.exist');
    cy.get(tid('puzzle-seed')).should('have.text', 'cy-flow-two');
    cy.get(tid('puzzle-status')).should('contain.text', 'playing');
    cy.location('search').should('eq', '?seed=cy-flow-two&d=easy');
    cy.reload();
    cy.get(tid('board')).should('be.visible');
    cy.get(tid('puzzle-seed')).should('have.text', 'cy-flow-two');
    cy.get(tid('puzzle-difficulty')).should('have.text', 'easy');
  });

  it('asks before discarding progress when starting a new game', () => {
    load();
    solutionOfLoaded().then((cells) => placePerson(0, cells[0]!.r, cells[0]!.c));
    cy.get(tid('new-game-button')).click();
    cy.get(tid('newgame-seed')).type('cy-flow-three');
    cy.get(tid('newgame-start')).click();
    cy.get(tid('newgame-confirm')).should('be.visible');
    cy.get(tid('newgame-confirm-no')).click();
    cy.get(tid('newgame-dialog')).should('be.visible');
    cy.get(tid('newgame-start')).click();
    cy.get(tid('newgame-confirm-yes')).click();
    cy.get(tid('puzzle-seed')).should('have.text', 'cy-flow-three');
  });
});
