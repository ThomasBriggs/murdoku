import { moreClick, openKey } from '../support/helpers';

const URL = '/?seed=cy-marks&d=easy';
const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);
const tool = (t: string) => cy.get(`[data-testid="tool-${t}"]`);

/** Row-major [r, c] of cells a person can stand on. */
function freeCells(): Cypress.Chainable<[number, number][]> {
  return cy
    .get('[data-testid="board-grid"] [data-blocked="false"]')
    .then(($c) =>
      $c.toArray().map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]),
    );
}

function load() {
  cy.visit(URL);
  cy.get('[data-testid="board"]').should('be.visible');
}

/** Drag across cells with pointer events (what a mouse or finger produces). */
function drag(cells: [number, number][]) {
  const [first, ...rest] = cells;
  cell(...first!).trigger('pointerdown', { button: 0, buttons: 1 });
  for (const c of rest) cell(...c).trigger('pointermove', { buttons: 1 });
  cell(...cells[cells.length - 1]!).trigger('pointerup');
}

describe('solving toolkit: marks, notes, highlights', () => {
  it('has a tooltip with the shortcut on every tool', () => {
    load();
    cy.get('button[data-testid^="tool-"]').should('have.length', 11);
    tool('cross').should('have.attr', 'title').and('contain', 'X');
    tool('pencil').should('have.attr', 'title').and('contain', 'P');
    tool('notes').should('have.attr', 'title').and('contain', 'N');
  });

  it('marks cells with cross, dot and unsure, from the palette and the keyboard', () => {
    load();
    tool('cross').click();
    cell(0, 0).click().should('have.attr', 'data-mark', 'cross');
    tool('dot').click();
    cell(0, 1).click().should('have.attr', 'data-mark', 'dot');
    tool('unsure').click();
    cell(0, 2).click().should('have.attr', 'data-mark', 'unsure');
    cell(0, 0).click(); // unsure replaces the cross
    cell(0, 0).should('have.attr', 'data-mark', 'unsure');
    cell(1, 1).focus().type('x');
    cell(1, 1).should('have.attr', 'data-mark', 'cross');
    cell(1, 1).rightclick();
    cell(1, 1).should('not.have.attr', 'data-mark');
    cell(1, 2).rightclick().should('have.attr', 'data-mark', 'cross');
  });

  it('adds candidate initials in notes mode by click and number keys, and eliminates', () => {
    load();
    tool('notes').click();
    cy.get('[data-testid="person-card-1"]').click();
    cell(2, 2).click().should('have.attr', 'data-candidates', '1');
    cy.get('[data-testid="cand-2-2-1"]').should('have.attr', 'data-state', 'yes');
    cell(2, 3).click().should('have.attr', 'data-candidates', '1');
    // Shift flips to eliminated (slashed) instead
    cell(2, 3).click({ shiftKey: true });
    cell(2, 3).should('have.attr', 'data-eliminated', '1').and('not.have.attr', 'data-candidates');
    cy.get('[data-testid="cand-2-3-1"]').should('have.attr', 'data-state', 'no');
    // number keys: the third card in the panel
    cy.get('[data-testid^="person-card-"]')
      .eq(2)
      .invoke('attr', 'data-testid')
      .then((tid) => {
        const id = tid!.replace('person-card-', '');
        cell(4, 4).focus().type('3');
        cell(4, 4).should('have.attr', 'data-candidates', id);
        // the same person keeps the same slot in every cell
        cell(5, 5).focus().type('3');
        cy.get(`[data-testid="cand-4-4-${id}"]`).should('exist');
        cy.get(`[data-testid="cand-5-5-${id}"]`).should('exist');
      });
    // eliminate tool
    tool('eliminate').click();
    cell(6, 6).click(); // person 1 is still selected
    cell(6, 6).should('have.attr', 'data-eliminated', '1');
  });

  it('places tentatively in pencil mode and promotes with one click', () => {
    load();
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      tool('pencil').click();
      cy.get('[data-testid="person-card-0"]').click();
      cell(r, c).click();
      cy.get('[data-testid="tentative-0"]').should('exist');
      cell(r, c).should('have.attr', 'data-tentative', '0').and('have.attr', 'data-occupant', '');
      cy.get('[data-testid="person-status-0"]').should('contain.text', 'Guess');
      // no auto-cross: a guess is not a placement
      cy.get('[data-autocross="true"]').should('not.exist');
      cy.get('[data-testid="promote-0"]').click();
      cell(r, c).should('have.attr', 'data-occupant', '0');
      cy.get('[data-testid="tentative-0"]').should('not.exist');
      cy.get('[data-autocross="true"]').should('have.length.greaterThan', 0);
    });
  });

  it('highlights with a colour and gives it a pattern marker', () => {
    load();
    tool('highlight').click();
    cy.get('[data-testid="color-red"]').click();
    cell(3, 3).click().should('have.attr', 'data-hl-color', 'red');
    cy.get('[data-testid="hl-3-3"]').should('exist');
    cy.get('[data-testid="color-blue"]').click();
    cell(3, 4).click().should('have.attr', 'data-hl-color', 'blue');
    cy.get('[data-testid="hl-3-4"]').invoke('css', 'background-image').should('not.eq', 'none');
    cell(3, 4).click().should('not.have.attr', 'data-hl-color');
    // C cycles the colour (this runs outside a text field)
    cy.get('body').type('c');
    cy.get('[data-testid="color-purple"]').should('have.attr', 'aria-checked', 'true');
  });

  it('drag-selects cells and applies a cross to all of them', () => {
    load();
    const path: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    drag(path);
    cy.get('[data-sel="true"]').should('have.length', 4);
    tool('cross').click();
    for (const [r, c] of path) cell(r, c).should('have.attr', 'data-mark', 'cross');
    cy.get('[data-mark="cross"]').should('have.length', 4);
    cy.get('body').type('{esc}');
    cy.get('[data-sel="true"]').should('not.exist');
    // Shift-click multi-select, then a highlight for all
    cell(5, 5).click({ shiftKey: true });
    cell(6, 6).click({ shiftKey: true });
    tool('highlight').click();
    cy.get('[data-testid="color-green"]').click();
    cell(5, 5).should('have.attr', 'data-hl-color', 'green');
    cell(6, 6).should('have.attr', 'data-hl-color', 'green');
  });

  it('quick-selects a row, a column, a room and a furniture type', () => {
    load();
    cy.get('[data-testid="row-label-3"]').click();
    cy.get('[data-sel="true"]').should('have.length', 9);
    cell(3, 7).should('have.attr', 'data-sel', 'true');
    cy.get('[data-testid="col-label-5"]').click({ shiftKey: true });
    cy.get('[data-sel="true"]').should('have.length', 17);
    cy.get('[data-testid="col-label-0"]').click();
    cy.get('[data-sel="true"]').should('have.length', 9);
    cell(8, 0).should('have.attr', 'data-sel', 'true');

    // whole room by double-clicking its label, then cross it all out
    cy.get('[data-testid^="room-label-"]')
      .first()
      .dblclick()
      .invoke('attr', 'data-testid')
      .then((tid) => {
        const room = tid!.replace('room-label-', '');
        cy.get(`[data-room="${room}"]`).then(($cells) => {
          const n = $cells.length;
          cy.get('[data-sel="true"]').should('have.length', n);
          tool('cross').click();
          cy.get(`[data-room="${room}"][data-mark="cross"]`).should('have.length', n);
        });
      });

    // all cells of a furniture type from the furniture legend
    cy.get('body').type('{esc}');
    openKey();
    cy.get('[data-testid^="legend-furniture-"]')
      .first()
      .click()
      .invoke('attr', 'data-testid')
      .then((tid) => {
        const type = tid!.replace('legend-furniture-', '');
        cy.get(`[data-furniture="${type}"]`).then(($f) => {
          cy.get('[data-sel="true"]').should('have.length', $f.length);
        });
      });
  });

  it('writes a note on a room; row and column notes no longer exist', () => {
    load();
    cy.get('[data-testid^="row-note-"]').should('not.exist');
    cy.get('[data-testid^="col-note-"]').should('not.exist');
    cy.get('[data-testid^="room-note-btn-"]').first().click();
    cy.get('[data-testid^="room-note-input-"]').type('victim + 1{enter}');
    cy.get('[data-testid^="room-note-"]')
      .filter(':not([data-testid^="room-note-btn"]):not([data-testid^="room-note-input"])')
      .should('contain.text', 'victim + 1')
      .and('be.visible');
    cy.get('[data-note="true"]').should('exist');
    // undo takes the note back
    cy.get('[data-testid="undo"]').click();
    cy.get('[data-note="true"]').should('not.exist');
  });

  it('ticks clue parts, strikes a clue and keeps a note on a person card', () => {
    load();
    // find a clue with at least two parts
    cy.get('[data-testid^="clue-tick-"]').then(($ticks) => {
      const ids = $ticks.toArray().map((el) => el.dataset.testid!);
      const person = ids.find((t) => t.endsWith('-1'))!.split('-')[2]!;
      cy.get(`[data-testid="clue-tick-${person}-0"]`).click();
      cy.get(`[data-testid="clue-atom-${person}-0"]`).should('have.attr', 'data-ticked', 'true');
      cy.get(`[data-testid="clue-atom-${person}-1"]`).should('have.attr', 'data-ticked', 'false');
      cy.get(`[data-testid="person-card-${person}"]`).should('have.attr', 'data-selected', 'false');
      cy.get(`[data-testid="clue-tick-${person}-1"]`).click();
      cy.get(`[data-testid="clue-atom-${person}-1"]`).should('have.attr', 'data-ticked', 'true');
      cy.get(`[data-testid="clue-tick-${person}-0"]`).click();
      cy.get(`[data-testid="clue-atom-${person}-0"]`).should('have.attr', 'data-ticked', 'false');

      cy.get(`[data-testid="clue-strike-${person}"]`).click();
      cy.get(`[data-testid="person-card-${person}"]`).should('have.attr', 'data-struck', 'true');
      cy.get(`[data-testid="person-clue-${person}"]`).should(
        'have.css',
        'text-decoration-line',
        'line-through',
      );

      cy.get(`[data-testid="person-note-${person}"]`).should('not.exist');
      cy.get(`[data-testid="person-note-btn-${person}"]`).click();
      cy.get(`[data-testid="person-note-${person}"]`).type('row 2 or 7{enter}');
      cy.get(`[data-testid="person-note-text-${person}"]`).should('contain.text', 'row 2 or 7');
      cy.get(`[data-testid="person-note-text-${person}"]`).click();
      cy.get(`[data-testid="person-note-${person}"]`).should('have.value', 'row 2 or 7');
    });
  });

  it('hides a layer, clears annotations but keeps placements, and undoes', () => {
    load();
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      cy.get('[data-testid="person-card-0"]').click();
      cell(r, c).click();
      cell(r, c).should('have.attr', 'data-occupant', '0');

      tool('notes').click();
      cy.get('[data-testid="person-card-2"]').click();
      cell(8, 8).click().should('have.attr', 'data-candidates', '2');
      tool('cross').click();
      cell(7, 7).click().should('have.attr', 'data-mark', 'cross');

      // layers: hiding candidates removes them from view, showing restores
      moreClick('layers-button');
      cy.get('[data-testid="layer-candidates"]').uncheck();
      cell(8, 8).should('not.have.attr', 'data-candidates');
      cy.get('[data-testid^="cand-8-8"]').should('not.exist');
      cell(7, 7).should('have.attr', 'data-mark', 'cross');
      cy.get('[data-testid="layer-candidates"]').check();
      cell(8, 8).should('have.attr', 'data-candidates', '2');
      moreClick('layers-button');

      // clear all annotations, keep the placement
      moreClick('clear-button');
      cy.get('[data-testid="clear-annotations"]').click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[data-testid="cancel-reset"]').click();
      cell(7, 7).should('have.attr', 'data-mark', 'cross');
      moreClick('clear-button');
      cy.get('[data-testid="clear-annotations"]').click();
      cy.get('[data-testid="confirm-reset"]').click();
      cell(7, 7).should('not.have.attr', 'data-mark');
      cell(8, 8).should('not.have.attr', 'data-candidates');
      cell(r, c).should('have.attr', 'data-occupant', '0');

      // undo restores the annotations
      cy.get('[data-testid="undo"]').click();
      cell(7, 7).should('have.attr', 'data-mark', 'cross');
      cell(8, 8).should('have.attr', 'data-candidates', '2');
      cell(r, c).should('have.attr', 'data-occupant', '0');
    });
  });

  it('auto-clears a person’s candidates elsewhere once placed (setting)', () => {
    load();
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      const [r2, c2] = free[free.length - 1]!;
      tool('notes').click();
      cy.get('[data-testid="person-card-0"]').click();
      cell(r2, c2).click().should('have.attr', 'data-candidates', '0');
      tool('place').click();
      cell(r, c).click(); // person 0 is still selected from notes mode
      cell(r, c).should('have.attr', 'data-occupant', '0');
      cell(r2, c2).should('not.have.attr', 'data-candidates');
      cy.get('[data-testid="undo"]').click();
      cell(r2, c2).should('have.attr', 'data-candidates', '0');
    });
  });

  it('keeps the mobile layout without horizontal scroll', () => {
    cy.viewport(375, 740);
    load();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('[data-testid="tool-palette"]').should('be.visible');
    tool('cross').click();
    cell(4, 4).click().should('have.attr', 'data-mark', 'cross');
  });

  it('mobile: compact bar, colour row with Highlight, and a More sheet for the rest', () => {
    cy.viewport(375, 740);
    load();
    // the bar is one slim row with the common tools only
    cy.get('[data-testid="tool-palette"] button').should('have.length', 6);
    cy.get('[data-testid="tool-dot"]').should('not.exist');
    cy.get('[data-testid="more-button"]').parent().invoke('height').should('be.lessThan', 70);
    cy.get('[data-testid="color-row"]').should('not.exist');
    tool('highlight').click();
    cy.get('[data-testid="color-row"] [data-testid^="color-"]')
      .should('have.length', 6)
      .and('be.visible');
    cy.get('[data-testid="color-red"]').click();
    cell(3, 3).click().should('have.attr', 'data-hl-color', 'red');
    // the sheet holds the other tools and the menus
    cy.get('[data-testid="more-button"]').click();
    cy.get('[data-testid="more-sheet"]').should('be.visible');
    for (const t of ['dot', 'unsure', 'eliminate', 'select']) tool(t).should('be.visible');
    for (const id of [
      'redo',
      'reset',
      'layers-button',
      'clear-button',
      'hint-button',
      'check-button',
    ])
      cy.get(`[data-testid="${id}"]`).should('be.visible');
    tool('dot').click();
    cy.get('[data-testid="more-sheet"]').should('not.exist');
    cell(4, 4).click().should('have.attr', 'data-mark', 'dot');
    // a colour picked in the sheet activates Highlight
    cy.get('[data-testid="more-button"]').click();
    cy.get('[data-testid="color-blue"]').click();
    cell(5, 5).click().should('have.attr', 'data-hl-color', 'blue');
    // undo stays on the bar
    cy.get('[data-testid="undo"]').click();
    cell(5, 5).should('not.have.attr', 'data-hl-color');
    cy.get('[data-testid="more-button"]').click();
    cy.get('[data-testid="more-backdrop"]').click({ force: true });
    cy.get('[data-testid="more-sheet"]').should('not.exist');
  });

  it('desktop: people cards stay compact (all nine fit) until a note is opened', () => {
    cy.viewport(1280, 900);
    load();
    cy.get('[data-testid="person-card-0"], [data-testid^="person-card-"]')
      .last()
      .then(($c) => {
        expect($c[0]!.getBoundingClientRect().bottom).to.be.at.most(900);
      });
  });
});
