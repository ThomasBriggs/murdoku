import { accuseUntilWon, cell, solveByHints, sel as tid } from '../support/helpers';

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
    cy.get(tid('rules-keys-playing')).should('contain.text', 'Ask for a hint');
    cy.get(tid('rules-close')).click();
    cy.get(tid('rules-dialog')).should('not.exist');
  });

  it('keeps Accuse disabled until everyone is placed', () => {
    load();
    cy.get(tid('accuse-button'))
      .should('be.disabled')
      .and('have.attr', 'title')
      .and('match', /Place all 9/);
    cy.get(tid('hint-button')).click();
    cy.get(tid('hint-panel')).then(($p) => {
      cy.get(tid(`person-card-${$p.attr('data-hint-person')}`)).click();
      cell(Number($p.attr('data-hint-row')), Number($p.attr('data-hint-col'))).click();
    });
    cy.get(tid('hint-panel')).should('not.exist'); // cleared by the next action
    cy.get(tid('accuse-button')).should('be.disabled');
  });

  it('reports correct and wrong placements with a Check', () => {
    load();
    cy.get(tid('hint-button')).click();
    cy.get(tid('hint-panel')).then(($p) => {
      const right = $p.attr('data-hint-person');
      const r = Number($p.attr('data-hint-row'));
      const c = Number($p.attr('data-hint-col'));
      cell(r, c).should('have.attr', 'data-hint', 'target');
      // someone else standing on the hinted cell can only be wrong
      const wrong = right === '1' ? '2' : '1';
      cy.get(tid(`person-card-${wrong}`)).click();
      cell(r, c).click();
    });
    cy.get(tid('check-button')).click();
    cy.get(tid('check-text')).should('have.text', '0 correct, 1 wrong');
    cy.get('[data-testid^="wrong-badge-"]').should('not.exist');
    cy.get(tid('check-show-wrong')).check();
    cy.get('[data-testid^="wrong-badge-"]').should('have.length', 1);
  });

  it('plays a seed through with hints, accuses and wins', () => {
    load();
    const used = { n: 0 };
    solveByHints(used);
    cy.get(tid('accuse-button')).should('be.enabled').click();
    cy.get('[data-testid^="accuse-suspect-"]').should('have.length', 8);
    cy.get('[data-testid^="accuse-suspect-"]').then(($r) => {
      const ids = $r.toArray().map((el) => el.dataset.testid!.replace('accuse-suspect-', ''));
      accuseUntilWon(ids);
    });
    cy.get(tid('win-dialog')).should('be.visible');
    cy.get(tid('win-hints')).should(($e) => expect(Number($e.text())).to.eq(used.n));
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
    cy.get(tid('hint-button')).should('be.disabled');
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
    cy.get(tid('hint-button')).click();
    cy.get(tid('hint-apply')).click();
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
