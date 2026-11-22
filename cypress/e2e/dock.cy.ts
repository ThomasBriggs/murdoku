import { closeSettings, openKey, openSettings, pickTool, sel } from '../support/helpers';

const URL = '/?seed=cy-dock&d=easy';
const cell = (r: number, c: number) => cy.get(sel(`cell-${r}-${c}`));

function load() {
  cy.visit(URL);
  cy.get(sel('board')).should('be.visible');
}

describe('dock (desktop)', () => {
  it('is a floating bar with Place, Erase, Cross, undo/redo, Clues and the tray button', () => {
    load();
    cy.get(sel('dock')).within(() => {
      cy.get('button[data-testid^="tool-"]').then(($t) => {
        expect($t.toArray().map((el) => el.dataset.testid)).to.deep.eq([
          'tool-place',
          'tool-erase',
          'tool-cross',
        ]);
      });
      for (const id of ['undo', 'redo', 'clues-toggle', 'overflow-button'])
        cy.get(sel(id)).should('be.visible');
    });
  });

  it('the tray pops out the other tools; picking one closes it', () => {
    load();
    cy.get(sel('tool-dot')).should('not.exist');
    cy.get(sel('overflow-button')).click();
    cy.get(sel('tool-palette-tray')).within(() => {
      for (const id of ['pencil', 'dot', 'unsure', 'eliminate', 'highlight', 'select', 'draw'])
        cy.get(sel(`tool-${id}`)).should('be.visible');
      cy.get(sel('tool-cross')).should('not.exist');
    });
    cy.get(sel('tool-dot')).click();
    cy.get(sel('overflow-menu')).should('not.exist');
    cy.get(sel('board')).should('have.attr', 'data-tool', 'dot');
    cell(0, 0).click().should('have.attr', 'data-mark', 'dot');
  });

  it('shows the active tool with aria-pressed, from clicks and from shortcuts', () => {
    load();
    cy.get(sel('tool-place')).should('have.attr', 'aria-pressed', 'true');
    cy.get(sel('tool-cross')).click().should('have.attr', 'aria-pressed', 'true');
    cy.get(sel('tool-place')).should('have.attr', 'aria-pressed', 'false');
    cy.get(sel('board')).should('have.attr', 'data-tool', 'cross');
    cy.get('body').type('r');
    cy.get(sel('tool-erase')).should('have.attr', 'aria-pressed', 'true');
    cy.get(sel('tool-cross')).should('have.attr', 'aria-pressed', 'false');
    cy.get('body').type('v');
    cy.get(sel('tool-place')).should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid^="tool-"][aria-pressed="true"]').should('have.length', 1);
  });

  it('keys of tools that are not on the bar do nothing until pinned in Settings', () => {
    load();
    cy.get('body').type('p');
    cy.get(sel('board')).should('have.attr', 'data-tool', 'place');
    cy.get('body').type('g');
    cy.get(sel('logic-grid')).should('not.exist');
    // pin Pencil and the logic grid
    openSettings();
    cy.get(sel('quickbar-pencil')).check();
    cy.get(sel('quickbar-logic')).check();
    closeSettings();
    cy.get(sel('dock')).find(sel('tool-pencil')).should('be.visible');
    cy.get(sel('dock')).find(sel('quick-logic')).should('be.visible');
    cy.get('body').type('p');
    cy.get(sel('board')).should('have.attr', 'data-tool', 'pencil');
    cy.get('body').type('g');
    cy.get(sel('logic-grid')).should('be.visible');
    cy.get(sel('logic-close')).click();
    // the choice is remembered
    cy.reload();
    cy.get(sel('board')).should('be.visible');
    cy.get(sel('dock')).find(sel('tool-pencil')).should('be.visible');
    cy.get(sel('dock')).find(sel('quick-logic')).click();
    cy.get(sel('logic-grid')).should('be.visible');
    // unpin Cross: it leaves the bar and X stops working
    openSettings();
    cy.get(sel('quickbar-cross')).uncheck();
    closeSettings();
    cy.get(sel('dock')).find(sel('tool-cross')).should('not.exist');
    cell(2, 2).focus().type('x');
    cell(2, 2).should('not.have.attr', 'data-mark');
  });

  it('the active tool button looks different from the others', () => {
    load();
    cy.get(sel('tool-cross')).click();
    cy.get(sel('tool-cross')).then(($a) => {
      cy.get(sel('tool-erase')).then(($b) => {
        expect(getComputedStyle($a[0]!).backgroundColor).not.to.eq(
          getComputedStyle($b[0]!).backgroundColor,
        );
      });
    });
  });

  it('highlight and draw open a colour row above the dock', () => {
    load();
    cy.get(sel('color-row')).should('not.exist');
    pickTool('highlight');
    cy.get(sel('color-row')).should('be.visible');
    pickTool('draw');
    cy.get(sel('draw-controls')).should('be.visible');
    cy.get(sel('tool-cross')).click();
    cy.get(sel('color-row')).should('not.exist');
  });

  it('undo and redo enable with the history', () => {
    load();
    cy.get(sel('undo')).should('be.disabled');
    cy.get(sel('redo')).should('be.disabled');
    cy.get(sel('tool-cross')).click();
    cell(0, 0).click();
    cy.get(sel('undo')).should('be.enabled').click();
    cell(0, 0).should('not.have.attr', 'data-mark');
    cy.get(sel('redo')).should('be.enabled').click();
    cell(0, 0).should('have.attr', 'data-mark', 'cross');
  });

  it('Check and Accuse float beside the board, not in the tray', () => {
    load();
    cy.get('[role="group"][aria-label="Investigate"]').within(() => {
      for (const id of ['check-button', 'accuse-button']) cy.get(sel(id)).should('be.visible');
    });
    cy.get(sel('hint-button')).should('not.exist');
    cy.get(sel('overflow-button')).click();
    cy.get(sel('overflow-menu')).within(() => {
      cy.get(sel('accuse-button')).should('not.exist');
    });
  });
});

describe('tray menu', () => {
  it('opens and closes with aria-expanded, Escape (returning focus) and an outside click', () => {
    load();
    cy.get(sel('overflow-menu')).should('not.exist');
    cy.get(sel('overflow-button')).should('have.attr', 'aria-expanded', 'false').click();
    cy.get(sel('overflow-button')).should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('overflow-menu')).should('be.visible');
    for (const id of [
      'reset',
      'layers-button',
      'clear-button',
      'whatif-start',
      'logic-toggle',
      'print-button',
    ])
      cy.get(sel(id)).should('be.visible');
    cy.get(sel('layers-button')).focus();
    cy.get('body').type('{esc}');
    cy.get(sel('overflow-menu')).should('not.exist');
    cy.get(sel('overflow-button')).should('have.focus');
    cy.get(sel('overflow-button')).click();
    cy.get(sel('overflow-menu')).should('be.visible');
    cy.get(sel('board')).click('topLeft');
    cy.get(sel('overflow-menu')).should('not.exist');
  });

  it('Reset is disabled until something is placed', () => {
    load();
    cy.get(sel('overflow-button')).click();
    cy.get(sel('reset')).should('be.disabled');
  });

  it('Layers: hides and shows a layer; the menu stays open for it', () => {
    load();
    cy.get(sel('tool-cross')).click();
    cell(1, 1).click().should('have.attr', 'data-mark', 'cross');
    cy.get(sel('overflow-button')).click();
    cy.get(sel('layers-button')).click();
    cy.get(sel('layer-crosses')).uncheck();
    cell(1, 1).should('not.have.attr', 'data-mark');
    cy.get(sel('layer-crosses')).check();
    cell(1, 1).should('have.attr', 'data-mark', 'cross');
  });

  it('What-if, Logic grid and Print work from the menu and close it', () => {
    load();
    cy.window().then((win) => cy.stub(win, 'print').as('print'));
    cy.get(sel('overflow-button')).click();
    cy.get(sel('whatif-start')).click();
    cy.get(sel('overflow-menu')).should('not.exist');
    cy.get(sel('whatif-banner')).should('be.visible');
    cy.get(sel('overflow-button')).click();
    cy.get(sel('logic-toggle')).click();
    cy.get(sel('overflow-menu')).should('not.exist');
    cy.get(sel('logic-grid')).should('be.visible');
    cy.get(sel('logic-close')).click();
    cy.get(sel('overflow-button')).click();
    cy.get(sel('print-button')).click();
    cy.get(sel('print-dialog')).should('be.visible');
    cy.get(sel('print-cancel')).click();
    cy.get(sel('overflow-button')).should('have.focus');
  });

  it('Clear… and Reset open their confirmations', () => {
    load();
    cy.get(sel('tool-cross')).click();
    cell(1, 1).click();
    cy.get(sel('overflow-button')).click();
    cy.get(sel('clear-button')).click();
    cy.get(sel('clear-annotations')).click();
    cy.get(sel('cancel-reset')).click();
    cell(1, 1).should('have.attr', 'data-mark', 'cross');
  });
});

describe('furniture key', () => {
  it('is hidden until the Key button is pressed, then lists furniture and selects its cells', () => {
    load();
    cy.get(sel('furniture-legend')).should('not.exist');
    cy.get(sel('key-toggle')).should('have.attr', 'aria-expanded', 'false');
    openKey();
    cy.get(sel('key-toggle')).should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid^="legend-furniture-"]').first().click();
    cy.get('[data-sel="true"]').should('have.length.greaterThan', 0);
    cy.get(sel('key-toggle')).click();
    cy.get(sel('furniture-legend')).should('not.exist');
  });
});

describe('phone bottom bar', () => {
  it('has an always-visible Check/Accuse/Clues strip above the tools', () => {
    cy.viewport(375, 740);
    load();
    cy.get(sel('dock')).should('not.exist');
    cy.get(sel('mobile-dock')).within(() => {
      for (const id of ['check-button', 'accuse-button', 'clues-toggle'])
        cy.get(sel(id)).should('be.visible');
    });
    cy.get(sel('more-sheet')).should('not.exist');
    cy.get(sel('hint-button')).should('not.exist');
  });

  it('has the quick tools, undo/redo and the tray; the tray sheet holds the rest', () => {
    cy.viewport(375, 740);
    load();
    cy.get(sel('more-button')).should('have.attr', 'aria-expanded', 'false').click();
    cy.get(sel('more-sheet')).should('be.visible');
    cy.get(sel('more-button')).should('have.attr', 'aria-expanded', 'true');
    cy.get(sel('more-sheet')).within(() => {
      cy.get(sel('accuse-button')).should('not.exist');
    });
    for (const id of [
      'reset',
      'layers-button',
      'clear-button',
      'whatif-start',
      'logic-toggle',
      'print-button',
    ])
      cy.get(sel(id)).should('exist');
    cy.get(sel('logic-toggle')).click();
    cy.get(sel('more-sheet')).should('not.exist');
  });

  it('the sheet closes with Escape and returns focus to the tray button', () => {
    cy.viewport(375, 740);
    load();
    cy.get(sel('more-button')).click();
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get(sel('more-sheet')).should('not.exist');
    cy.get(sel('more-button')).should('have.focus');
  });
});
