import { sel } from '../support/helpers';

const URL = '/?seed=cy-dialogs&d=easy';

/** [trigger test id, dialog test id, the button focus must start on, the button that closes it]. */
const DIALOGS: [string, string, string, string][] = [
  ['rules-button', 'rules-dialog', 'rules-close', 'rules-close'],
  ['stats-button', 'stats-dialog', 'stats-close', 'stats-close'],
  ['new-game-button', 'newgame-dialog', 'newgame-start', 'newgame-cancel'],
];

describe('dialog focus management', () => {
  beforeEach(() => {
    cy.viewport(1280, 900);
    cy.visit(URL);
    cy.get(sel('board')).should('be.visible');
  });

  for (const [trigger, dialog, initial, closer] of DIALOGS) {
    it(`${dialog}: focuses the primary button, returns focus to the trigger`, () => {
      cy.get(sel(trigger)).focus().click();
      cy.get(sel(dialog)).should('be.visible');
      // Initial focus is on the primary / close button (or the first action for forms).
      cy.focused().should('exist');
      cy.focused().then(($f) => {
        expect($f.closest(sel(dialog)).length, 'focus is inside the dialog').to.eq(1);
        if (dialog !== 'newgame-dialog') expect($f.attr('data-testid')).to.eq(initial);
      });
      cy.get(sel(closer)).click();
      cy.get(sel(dialog)).should('not.exist');
      cy.focused().should('have.attr', 'data-testid', trigger);
    });
  }

  it('Escape closes a dialog and returns focus to its trigger', () => {
    cy.get(sel('stats-button')).click();
    cy.get(sel('stats-dialog')).should('be.visible');
    cy.focused().type('{esc}');
    cy.get(sel('stats-dialog')).should('not.exist');
    cy.focused().should('have.attr', 'data-testid', 'stats-button');
  });

  it('Tab wraps from the last control to the first and Shift+Tab back', () => {
    cy.get(sel('stats-button')).click();
    cy.get(sel('stats-dialog')).should('be.visible');
    // Buttons in order: Reset stats, Close. Focus starts on Close (last): Tab wraps to Reset.
    cy.focused().should('have.attr', 'data-testid', 'stats-close');
    cy.focused().trigger('keydown', { key: 'Tab', bubbles: true });
    cy.focused().should('have.attr', 'data-testid', 'stats-reset');
    cy.focused().trigger('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
    cy.focused().should('have.attr', 'data-testid', 'stats-close');
  });

  it('the stats reset confirmation focuses Cancel and returns to the trigger after closing', () => {
    cy.get(sel('stats-button')).click();
    cy.get(sel('stats-reset')).click();
    cy.focused().should('have.attr', 'data-testid', 'stats-reset-no');
    cy.get(sel('stats-reset-no')).click();
    cy.get(sel('stats-close')).click();
    cy.focused().should('have.attr', 'data-testid', 'stats-button');
  });
});
