import { closeSettings, gesture, moreClick, openMore, openSettings } from '../support/helpers';

const URL = '/?seed=cy-adv&d=easy';
const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);
const tid = (id: string) => cy.get(`[data-testid="${id}"]`);

function load() {
  cy.visit(URL);
  cy.get('[data-testid="board"]').should('be.visible');
}

/** First cell a person can stand on. */
function firstFree(): Cypress.Chainable<[number, number]> {
  return cy
    .get('[data-testid="board-grid"] [data-blocked="false"]')
    .first()
    .then(($c) => [Number($c[0]!.dataset.r), Number($c[0]!.dataset.c)] as [number, number]);
}

const SCRIBBLE: [number, number][] = [
  [0.2, 0.2],
  [0.35, 0.3],
  [0.5, 0.2],
  [0.65, 0.4],
];

describe('solving toolkit: logic grid, pen, scratchpad, what-if, helpers, print', () => {
  it('opens the logic grid with G and cycles a cell blank, cross, tick', () => {
    load();
    tid('logic-grid').should('not.exist');
    cy.get('body').type('g');
    tid('logic-grid').should('be.visible');
    tid('logic-table-rooms').should('exist');
    tid('logic-table-rows').should('exist');
    tid('logic-table-cols').should('exist');
    tid('logic-rows-0-3').should('have.attr', 'data-state', '0').click();
    tid('logic-rows-0-3').should('have.attr', 'data-state', '1').and('contain.text', '✗');
    tid('logic-rows-0-3').click().should('have.attr', 'data-state', '2').and('contain.text', '✓');
    tid('logic-rows-0-3').click().should('have.attr', 'data-state', '0');
    tid('logic-close').click();
    tid('logic-grid').should('not.exist');
    moreClick('logic-toggle');
    tid('logic-grid').should('be.visible');
  });

  it('draws a stroke with pointer events, erases it, and undoes both', () => {
    load();
    tid('drawing-layer').should('have.attr', 'data-active', 'false');
    cy.get('body').type('d');
    tid('drawing-layer').should('have.attr', 'data-active', 'true');
    gesture(SCRIBBLE);
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 1);
    tid('pen-eraser').click();
    gesture([[0.35, 0.3]]);
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 0);
    tid('undo').click();
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 1);
    // picking a colour while drawing keeps the draw tool and colours the pen
    tid('pen-pen').click();
    tid('color-red').click();
    tid('tool-draw').should('have.attr', 'aria-pressed', 'true');
    gesture([
      [0.1, 0.6],
      [0.5, 0.6],
    ]);
    cy.get('[data-testid="drawing-layer"] path[data-testid="stroke-1"]')
      .should('have.attr', 'style')
      .and('contain', 'hc-red');
    tid('undo').click();
    // highlighter and a different width
    tid('pen-highlighter').click();
    tid('pen-size-2').click();
    gesture([
      [0.1, 0.8],
      [0.8, 0.8],
    ]);
    cy.get('[data-testid="drawing-layer"] path[data-tool="highlighter"]').should('have.length', 1);
    tid('draw-clear').click();
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 0);
    // Escape leaves the tool, and the overlay lets pointers through again
    cy.get('body').type('{esc}');
    tid('drawing-layer').should('have.attr', 'data-active', 'false');
    tid('tool-place').should('have.attr', 'aria-pressed', 'true');
  });

  it('toggles the drawing layer and the lock keeps taps going to the cells', () => {
    load();
    cy.get('body').type('d');
    gesture(SCRIBBLE);
    moreClick('layers-button');
    tid('layer-drawing').should('not.be.disabled').uncheck();
    cy.get('[data-testid="drawing-layer"] path').should('not.exist');
    tid('drawing-layer').should('have.attr', 'data-active', 'false');
    tid('layer-drawing').check();
    cy.get('[data-testid="drawing-layer"] path').should('have.length', 1);
    moreClick('layers-button');

    tid('draw-lock').click().should('have.attr', 'aria-pressed', 'true');
    tid('drawing-layer').should('have.attr', 'data-active', 'false');
    gesture([
      [0.1, 0.9],
      [0.3, 0.9],
    ]);
    cy.get('[data-testid="drawing-layer"] path').should('have.length', 1);
    // a click now reaches the cell: pick a person and place them
    firstFree().then(([r, c]) => {
      tid('person-card-1').click();
      cell(r, c).click().should('have.attr', 'data-occupant', '1');
    });
    tid('draw-lock').click().should('have.attr', 'aria-pressed', 'false');
    tid('drawing-layer').should('have.attr', 'data-active', 'true');
  });

  it('keeps scratchpad text after closing and reopening the panel', () => {
    load();
    tid('scratchpad-text').should('not.exist');
    tid('scratchpad-toggle').click();
    tid('scratchpad-text').type('If C is in the Kitchen then B is out');
    tid('scratchpad-toggle').click(); // collapsing commits
    tid('scratchpad-text').should('not.exist');
    tid('scratchpad-toggle').click();
    tid('scratchpad-text').should('have.value', 'If C is in the Kitchen then B is out');
    tid('undo').click();
    tid('scratchpad-text').should('have.value', '');
  });

  it('what-if: abandon reverts, keep merges, nesting shows level 2', () => {
    load();
    firstFree().then(([r, c]) => {
      tid('whatif-banner').should('not.exist');
      // start, place, abandon
      cy.get('body').type('w');
      tid('whatif-level').should('have.text', 'What-if (level 1)');
      tid('board').should('have.attr', 'data-whatif', '1');
      tid('person-card-1').click();
      cell(r, c).click().should('have.attr', 'data-occupant', '1');
      tid('whatif-abandon').click();
      tid('whatif-note').type('B in the first cell');
      tid('whatif-abandon-confirm').click();
      cell(r, c).should('have.attr', 'data-occupant', '');
      tid('whatif-banner').should('not.exist');
      tid('scratchpad-toggle').click();
      tid('scratchpad-text').should('have.value', 'What-if: B in the first cell → abandoned');
      tid('scratchpad-toggle').click();

      // start, place, keep
      moreClick('whatif-start');
      tid('person-card-1').click();
      cell(r, c).click().should('have.attr', 'data-occupant', '1');
      tid('whatif-keep').click();
      tid('whatif-keep-confirm').click();
      tid('whatif-banner').should('not.exist');
      cell(r, c).should('have.attr', 'data-occupant', '1');

      // nesting
      moreClick('whatif-start');
      tid('whatif-nest').click();
      tid('whatif-level').should('have.text', 'What-if (level 2)');
      tid('whatif-breadcrumbs').should('contain.text', 'What-if 2');
      tid('whatif-nest').click(); // level 3
      tid('whatif-level').should('contain.text', 'level 3');
      tid('whatif-nest').should('be.disabled');
      openMore();
      tid('whatif-start').should('be.disabled');
      // undo walks back out through the starts
      tid('undo').click();
      tid('whatif-level').should('contain.text', 'level 2');
      tid('undo').click();
      tid('undo').click();
      tid('whatif-banner').should('not.exist');
    });
  });

  it('"show where this clue allows" dims cells for the selected person', () => {
    load();
    openSettings();
    tid('setting-clueallows').should('not.be.checked').check();
    closeSettings();
    cy.get('[data-dim="true"]').should('not.exist');
    tid('person-card-2').click();
    cy.get('[data-dim="true"]').should('exist');
    cy.get(
      '[data-testid="board-grid"] [data-dim="false"], [data-testid="board-grid"] [data-room]:not([data-dim])',
    )
      .its('length')
      .should('be.greaterThan', 0);
    tid('person-card-2').click(); // deselect
    cy.get('[data-dim="true"]').should('not.exist');
  });

  it('prints through a dialog with an include-marks option and a print stylesheet', () => {
    load();
    cy.window().then((win) => cy.stub(win, 'print').as('print'));
    tid('tool-cross').click();
    cell(0, 0).click();
    moreClick('print-button');
    tid('print-dialog').should('be.visible');
    tid('print-include-marks').check();
    tid('print-confirm').click();
    cy.get('@print').should('have.been.calledOnce');
    cy.get('[data-testid="print-sheet"][data-marks="true"] .ps-mark').should('have.length', 1);
    // the sheet is hidden on screen
    tid('print-sheet').should('not.be.visible');
    // ... and the print stylesheet exists and hides the toolbar when printing
    cy.document().then((doc) => {
      const rules = [...doc.styleSheets].flatMap((s) => {
        try {
          return [...s.cssRules];
        } catch {
          return [];
        }
      });
      // (CSSMediaRule is a different realm's class here, so test by shape.)
      const media = rules.filter(
        (r) => 'media' in r && (r as CSSMediaRule).media.mediaText.includes('print'),
      ) as CSSMediaRule[];
      expect(media.length, '@media print rules').to.be.greaterThan(0);
      const text = media.map((m) => m.cssText).join('\n');
      expect(text).to.contain('display: none');
      expect(text).to.contain('print-sheet');
    });
  });
});
