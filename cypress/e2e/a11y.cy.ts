import {
  checkA11y,
  closeClues,
  moreClick,
  openClues,
  openKey,
  openMore,
  openSettings,
  playToWin,
  sel,
  selectPerson,
  setTheme,
} from '../support/helpers';

const URL = '/?seed=cy-a11y&d=easy';
const cell = (r: number, c: number) => cy.get(sel(`cell-${r}-${c}`));

function load() {
  cy.visit(URL);
  cy.get(sel('board')).should('be.visible');
}

/** A little progress so tokens, marks, candidates, highlights and a tentative token are on the board. */
function populate() {
  cy.get('[data-testid="board-grid"] [data-blocked="false"]').then(($cells) => {
    const free = $cells
      .toArray()
      .map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]);
    const used = new Set<number>();
    let n = 0;
    for (const [r, c] of free) {
      if (n >= 3) break;
      if (used.has(r)) continue;
      used.add(r);
      selectPerson(n);
      cell(r, c).click();
      n++;
    }
  });
  cy.get(sel('tool-cross')).click();
  cell(8, 8).click();
  cy.get(sel('tool-highlight')).click();
  cell(7, 0).click();
  cy.get(sel('tool-notes')).click();
  selectPerson(5);
  cell(6, 6).click();
  cy.get(sel('tool-place')).click();
}

describe('accessibility (axe)', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`desktop main screen, ${theme}`, () => {
      cy.viewport(1280, 900);
      load();
      setTheme(theme);
      populate();
      checkA11y();
    });
    it(`mobile main screen, ${theme}`, () => {
      cy.viewport(375, 740);
      load();
      setTheme(theme);
      populate();
      checkA11y();
    });
  }

  it('desktop with the overflow menu, settings and layers open', () => {
    cy.viewport(1280, 900);
    load();
    openMore();
    checkA11y();
    cy.get(sel('layers-button')).click();
    openSettings();
    checkA11y();
  });

  it('mobile More sheet', () => {
    cy.viewport(375, 740);
    load();
    cy.get(sel('more-button')).click();
    checkA11y();
  });

  it('clues drawer as an overlay (1000px) and as a phone bottom sheet', () => {
    cy.viewport(1000, 700);
    load();
    openClues();
    checkA11y();
    closeClues();
    cy.viewport(375, 740);
    openClues();
    checkA11y();
  });

  it('scratchpad panel and furniture key', () => {
    cy.viewport(1280, 900);
    load();
    cy.get(sel('scratchpad-toggle')).click();
    cy.get(sel('scratchpad-text')).type('If C then F').blur();
    cy.get(sel('scratchpad-panel')).should('be.visible');
    openKey();
    checkA11y();
    cy.get(sel('scratchpad-toggle')).click();
    cy.get(sel('scratchpad-toggle')).should('have.attr', 'data-has-text', 'true');
    checkA11y();
  });

  it('logic grid (desktop and mobile sheet)', () => {
    cy.viewport(1280, 900);
    load();
    moreClick('logic-toggle');
    cy.get(sel('logic-grid')).should('be.visible');
    checkA11y();
    cy.viewport(375, 740);
    cy.get(sel('logic-grid')).should('be.visible');
    checkA11y();
  });

  it('draw controls, what-if banner and hint panel', () => {
    cy.viewport(1280, 900);
    load();
    cy.get(sel('tool-draw')).click();
    cy.get(sel('draw-controls')).should('be.visible');
    checkA11y();
    cy.get(sel('tool-place')).click();
    moreClick('whatif-start');
    cy.get(sel('whatif-banner')).should('be.visible');
    cy.get(sel('hint-button')).click();
    cy.get(sel('hint-panel')).should('be.visible');
    checkA11y();
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`header dialogs: rules, stats, new game, ${theme}`, () => {
      cy.viewport(1280, 900);
      load();
      setTheme(theme);
      cy.get(sel('rules-button')).click();
      checkA11y();
      cy.get('body').type('{esc}');
      cy.get(sel('stats-button')).click();
      checkA11y();
      cy.get(sel('stats-reset')).click();
      checkA11y();
      cy.get(sel('stats-reset-no')).click();
      cy.get(sel('stats-close')).click();
      cy.get(sel('new-game-button')).click();
      checkA11y();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`confirm dialogs: reset, clear, print, ${theme}`, () => {
      cy.viewport(1280, 900);
      load();
      setTheme(theme);
      selectPerson(0);
      cy.get('[data-testid="board-grid"] [data-blocked="false"]').first().click();
      moreClick('reset');
      checkA11y();
      cy.get(sel('cancel-reset')).click();
      moreClick('clear-button');
      checkA11y();
      cy.get(sel('clear-annotations')).click();
      checkA11y();
      cy.get(sel('cancel-reset')).click();
      moreClick('print-button');
      checkA11y();
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`accuse and win dialogs, ${theme}`, () => {
      cy.viewport(1280, 900);
      load();
      setTheme(theme);
      playToWin();
      checkA11y();
    });
  }
});
