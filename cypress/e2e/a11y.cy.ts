import {
  checkA11y,
  closeClues,
  moreClick,
  openClues,
  openKey,
  openMore,
  openSettings,
  pickTool,
  placePerson,
  sel,
  selectPerson,
  setTheme,
  solutionOfLoaded,
  solveFromSeed,
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
      placePerson(n, r, c);
      n++;
    }
  });
  pickTool('cross');
  cell(8, 8).click();
  pickTool('highlight');
  cell(7, 0).click();
  pickTool('place');
  selectPerson(5);
  cell(6, 6).click(); // a quick tap in Place mode notes a candidate
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

  it('draw controls, what-if banner and check panel', () => {
    cy.viewport(1280, 900);
    load();
    pickTool('draw');
    cy.get(sel('draw-controls')).should('be.visible');
    checkA11y();
    pickTool('place');
    solutionOfLoaded().then((cells) => placePerson(1, cells[1]!.r, cells[1]!.c));
    cy.get(sel('check-button')).click();
    cy.get(sel('check-text')).should('be.visible');
    moreClick('whatif-start');
    cy.get(sel('whatif-banner')).should('be.visible');
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
      cy.get('[data-testid="board-grid"] [data-blocked="false"]')
        .first()
        .then(($c) => placePerson(0, Number($c[0]!.dataset.r), Number($c[0]!.dataset.c)));
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
      solveFromSeed();
      cy.get(sel('accuse-button')).click();
      cy.get(sel('accuse-dialog')).should('be.visible');
      checkA11y();
      cy.get(sel('accuse-confirm')).click();
      cy.get(sel('win-dialog')).should('be.visible');
      checkA11y();
    });
  }
});
