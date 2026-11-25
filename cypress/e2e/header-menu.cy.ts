import { sel } from '../support/helpers';

const URL = '/?seed=cy-menu&d=easy';

function load() {
  cy.visit(URL);
  cy.get(sel('board')).should('be.visible');
}

describe('mobile header menu (375x740)', () => {
  beforeEach(() => {
    cy.viewport(375, 740);
    load();
  });

  it('shows New game and a menu button; the other actions are inside the menu', () => {
    cy.get(sel('new-game-button')).should('be.visible');
    cy.get(sel('header-menu-button'))
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false');
    for (const id of ['share-button', 'stats-button', 'rules-button', 'settings-button'])
      cy.get(sel(id)).should('not.exist');
  });

  it('opens, lists the actions with tall tap targets, and closes again', () => {
    cy.get(sel('header-menu-button')).click().should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('header-menu')).should('be.visible');
    for (const id of ['share-button', 'stats-button', 'rules-button', 'settings-button'])
      cy.get(sel(id))
        .should('be.visible')
        .then(($b) => expect($b[0]!.getBoundingClientRect().height).to.be.at.least(44));
    cy.get(sel('header-menu-button')).click().should('have.attr', 'aria-expanded', 'false');
    cy.get(sel('header-menu')).should('not.exist');
  });

  it('closes with Escape (focus returns to the button) and on a tap outside', () => {
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('header-menu')).should('be.visible');
    cy.get('body').type('{esc}');
    cy.get(sel('header-menu')).should('not.exist');
    cy.focused().should('have.attr', 'data-testid', 'header-menu-button');
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('board')).click(10, 10, { force: true });
    cy.get(sel('header-menu')).should('not.exist');
  });

  it('Rules opens the rules dialog and closes the menu', () => {
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('rules-button')).click();
    cy.get(sel('header-menu')).should('not.exist');
    cy.get(sel('rules-dialog')).should('be.visible');
    cy.get(sel('rules-close')).click();
    cy.get(sel('rules-dialog')).should('not.exist');
  });

  it('Statistics opens the stats dialog and closes the menu', () => {
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('stats-button')).click();
    cy.get(sel('header-menu')).should('not.exist');
    cy.get(sel('stats-dialog')).should('be.visible');
  });

  it('Settings opens a panel inside the menu, without theme radios', () => {
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('settings-button')).click().should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('header-menu')).find(sel('settings-popover')).should('be.visible');
    cy.get(sel('settings-popover')).find('input[type="radio"]').should('not.exist');
    cy.get(sel('settings-popover')).find('[data-testid^="theme-"]').should('not.exist');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(375);
    });
  });

  it('the Theme row cycles System, Light, Dark and keeps the menu open', () => {
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('theme-toggle')).should('have.attr', 'data-theme', 'system');
    cy.get('html').should('not.have.attr', 'data-theme');
    cy.get(sel('theme-toggle')).should('contain.text', 'Theme: System').click();
    cy.get('html').should('have.attr', 'data-theme', 'light');
    cy.get(sel('theme-toggle')).should('contain.text', 'Theme: Light').click();
    cy.get('html').should('have.attr', 'data-theme', 'dark');
    cy.get(sel('theme-toggle')).should('contain.text', 'Theme: Dark').click();
    cy.get('html').should('not.have.attr', 'data-theme');
    cy.get(sel('header-menu')).should('be.visible');
  });

  it('New game stays outside the menu and opens the new-game dialog', () => {
    cy.get(sel('new-game-button')).click();
    cy.get(sel('newgame-dialog')).should('be.visible');
  });

  it('fits down to 320px wide', () => {
    cy.viewport(320, 568);
    cy.get(sel('header-menu-button')).click();
    cy.get(sel('header-menu')).then(($m) => {
      const r = $m[0]!.getBoundingClientRect();
      expect(r.left).to.be.at.least(0);
      expect(r.right).to.be.at.most(320);
    });
  });
});

describe('header on desktop (1280x900)', () => {
  it('has no menu button; the actions sit in the header', () => {
    cy.viewport(1280, 900);
    load();
    cy.get(sel('header-menu-button')).should('not.exist');
    for (const id of ['share-button', 'stats-button', 'rules-button', 'settings-button'])
      cy.get(sel(id)).should('be.visible');
  });
});
