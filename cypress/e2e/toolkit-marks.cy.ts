import { longPress, moreClick, openKey, pickTool, visitWithQuickBar } from '../support/helpers';

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
  visitWithQuickBar(URL);
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
    cy.get('button[data-testid^="tool-"]').should('have.length', 10);
    tool('notes').should('not.exist');
    tool('cross').should('have.attr', 'title').and('contain', 'X');
    tool('pencil').should('have.attr', 'title').and('contain', 'P');
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

  it('keyboard marks ignore a clicked cell until the cursor is shown by an arrow key', () => {
    load();
    cell(2, 2).click();
    cy.get('[data-testid="board-grid"]').should('not.have.attr', 'data-kbd');
    cell(2, 2).type('x');
    cell(2, 2).should('not.have.attr', 'data-mark');
    tool('cross').should('have.attr', 'aria-pressed', 'true');
    cell(2, 2).type('{rightarrow}x');
    cy.get('[data-testid="board-grid"]').should('have.attr', 'data-kbd', 'true');
    cell(2, 3).should('have.attr', 'data-mark', 'cross');
    cell(2, 2).should('not.have.attr', 'data-mark');
  });

  it('Escape after a drag-select clears the selection and hides the cursor ring', () => {
    load();
    drag([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    cy.get('[data-sel]').should('have.length.at.least', 1);
    cy.get('body').type('{esc}');
    cy.get('[data-sel]').should('not.exist');
    cy.get('[data-testid="board-grid"]').should('not.have.attr', 'data-kbd');
  });

  it('Place: a quick tap notes a candidate, press-and-hold places, Eliminate slashes', () => {
    load();
    freeCells().then((free) => {
      const [a, b, p] = [free[0]!, free[1]!, free.find(([r]) => r > 3)!];
      cy.get('[data-testid="person-card-1"]').click();
      cell(...a)
        .click()
        .should('have.attr', 'data-candidates', '1');
      cy.get(`[data-testid="cand-${a[0]}-${a[1]}-1"]`).should('have.attr', 'data-state', 'yes');
      cell(...a).should('have.attr', 'data-occupant', '');
      cell(...b)
        .click()
        .should('have.attr', 'data-candidates', '1');
      // the person stays picked; a second tap takes the note away
      cell(...b)
        .click()
        .should('not.have.attr', 'data-candidates');
      // keyboard: digits pick a person, Space notes, Enter places
      cy.get('[data-testid^="person-card-"]')
        .eq(2)
        .invoke('attr', 'data-testid')
        .then((tid) => {
          const id = tid!.replace('person-card-', '');
          cell(...b)
            .focus()
            .type('3')
            .type(' ');
          cell(...b).should('have.attr', 'data-candidates', id);
          cy.get(`[data-testid="cand-${b[0]}-${b[1]}-${id}"]`).should('exist');
        });
      // press and hold commits the placement (click the name: the card centre may be a clue word;
      // Esc first, since a click on the already selected card would deselect it)
      cy.get('body').type('{esc}');
      cy.get('[data-testid="person-card-1"]').find('button').first().click();
      cy.get('[data-testid="person-card-1"]').should('have.attr', 'data-selected', 'true');
      longPress(...p);
      cell(...p).should('have.attr', 'data-occupant', '1');
      cell(...p).should('not.have.attr', 'data-candidates');
      // eliminate tool (placing deselected the person)
      cy.get('[data-testid="person-card-1"]').find('button').first().click();
      tool('eliminate').click();
      cell(...b).click();
      cell(...b).should('have.attr', 'data-eliminated', '1');
    });
  });

  it('picking a person in the clues switches to the Place tool', () => {
    load();
    tool('cross').click().should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="person-card-1"]').find('button').first().click();
    tool('place').should('have.attr', 'aria-pressed', 'true');
    tool('cross').should('have.attr', 'aria-pressed', 'false');
  });

  it('Cross tool: hold clears the notes and crosses; a quick tap toggles the cross', () => {
    load();
    freeCells().then((free) => {
      const a = free[0]!;
      cy.get('[data-testid="person-card-1"]').click();
      cell(...a).click();
      cy.get('[data-testid="person-card-2"]').click();
      cell(...a).click();
      cy.get(`[data-testid="cand-${a[0]}-${a[1]}-1"]`).should('exist');
      cy.get(`[data-testid="cand-${a[0]}-${a[1]}-2"]`).should('exist');
      tool('cross').click();
      longPress(...a);
      cell(...a).should('have.attr', 'data-mark', 'cross');
      cell(...a).should('not.have.attr', 'data-candidates');
      cy.get(`[data-testid^="cand-${a[0]}-${a[1]}-"]`).should('not.exist');
      cell(...a)
        .click()
        .should('not.have.attr', 'data-mark');
    });
  });

  it('Place with nobody picked: hold places a single noted person or opens a radial menu', () => {
    load();
    freeCells().then((free) => {
      const [a, b] = [free[0]!, free[free.length - 1]!];
      cy.get('[data-testid="person-card-1"]').click();
      cell(...a).click();
      cy.get('body').type('{esc}');
      cell(...a).should('have.attr', 'data-candidates', '1');
      longPress(...a);
      cell(...a).should('have.attr', 'data-occupant', '1');
      // two noted on another cell: a menu offers both
      cy.get('[data-testid="person-card-2"]').click();
      cell(...b).click();
      cy.get('[data-testid="person-card-3"]').click();
      cell(...b).click();
      cy.get('body').type('{esc}');
      longPress(...b);
      cy.get('[data-testid="radial-pick"]').should('exist');
      cy.get('[data-testid="radial-pick-2"]').should('be.visible');
      cy.get('[data-testid="radial-pick-3"]').should('be.visible');
      cy.get('[data-testid="radial-pick-cancel"]').click();
      cy.get('[data-testid="radial-pick"]').should('not.exist');
      cell(...b).should('have.attr', 'data-occupant', '');
      longPress(...b);
      cy.get('[data-testid="radial-pick-3"]').click();
      cy.get('[data-testid="radial-pick"]').should('not.exist');
      cell(...b).should('have.attr', 'data-occupant', '3');
    });
  });

  it('places tentatively in pencil mode and promotes with one click', () => {
    load();
    freeCells().then((free) => {
      const [r, c] = free[0]!;
      cy.get('[data-testid="person-card-0"]').click();
      tool('pencil').click();
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

  it('V notes the picked person on a selection; on one cell a quick V notes and a held V places', () => {
    load();
    freeCells().then((free) => {
      const path = free.slice(0, 3);
      drag(path);
      cy.get('[data-sel="true"]').should('have.length', 3);
      cell(...path[0]!)
        .focus()
        .type('2v');
      for (const [r, c] of path) cell(r, c).should('have.attr', 'data-candidates', '0');
      cy.get('[data-occupant]:not([data-occupant=""])').should('not.exist');
      // one target cell: the cursor after an arrow key
      cy.get('body').type('{esc}');
      const [r, c] = free.find(([fr, fc]) => fr > 3 && fc > 0)!;
      cy.get('[data-testid="person-card-1"]').click();
      cell(r, c - 1)
        .focus()
        .type('{rightarrow}');
      cell(r, c).type('v');
      cell(r, c).should('have.attr', 'data-candidates', '1');
      cell(r, c).should('have.attr', 'data-occupant', '');
      cell(r, c).trigger('keydown', { key: 'v' });
      cy.wait(600);
      cell(r, c).trigger('keyup', { key: 'v' });
      cell(r, c).should('have.attr', 'data-occupant', '1');
    });
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

  it('has no note fields for rows, columns or rooms', () => {
    load();
    cy.get('[data-testid^="row-note-"]').should('not.exist');
    cy.get('[data-testid^="col-note-"]').should('not.exist');
    cy.get('[data-testid^="room-note-"]').should('not.exist');
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
      longPress(r, c);
      cell(r, c).should('have.attr', 'data-occupant', '0');

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
      cy.get('[data-testid="person-card-0"]').click();
      cell(r2, c2).click().should('have.attr', 'data-candidates', '0');
      longPress(r, c); // person 0 is still selected after the note
      cell(r, c).should('have.attr', 'data-occupant', '0');
      cell(r2, c2).should('not.have.attr', 'data-candidates');
      cy.get('[data-testid="undo"]').click();
      cell(r2, c2).should('have.attr', 'data-candidates', '0');
    });
  });

  it('keeps the mobile layout without horizontal scroll, even with every tool pinned', () => {
    cy.viewport(375, 740);
    load();
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('[data-testid="tool-palette"]').should('be.visible');
    tool('cross').click();
    cell(4, 4).click().should('have.attr', 'data-mark', 'cross');
  });

  it('mobile: the default bar is Place, Erase, Cross; the tray sheet has the rest', () => {
    cy.viewport(375, 740);
    cy.visit(URL);
    cy.get('[data-testid="board"]').should('be.visible');
    // one slim row: the three quick tools, undo/redo and the tray button
    cy.get('[data-testid="tool-palette"] button').should('have.length', 3);
    for (const id of ['tool-place', 'tool-erase', 'tool-cross', 'undo', 'redo', 'more-button'])
      cy.get(`[data-testid="mobile-dock"] [data-testid="${id}"]`).should('be.visible');
    cy.get('[data-testid="tool-dot"]').should('not.exist');
    cy.get('[data-testid="more-button"]').parent().invoke('height').should('be.lessThan', 70);
    cy.get('[data-testid="color-row"]').should('not.exist');
    // the sheet holds the other tools and the menus
    cy.get('[data-testid="more-button"]').click();
    cy.get('[data-testid="more-sheet"]').should('be.visible');
    for (const t of ['pencil', 'dot', 'unsure', 'eliminate', 'highlight', 'select', 'draw'])
      tool(t).should('be.visible');
    for (const id of ['reset', 'layers-button', 'clear-button', 'whatif-start', 'logic-toggle'])
      cy.get(`[data-testid="more-sheet"] [data-testid="${id}"]`).should('be.visible');
    tool('dot').click();
    cy.get('[data-testid="more-sheet"]').should('not.exist');
    cell(4, 4).click().should('have.attr', 'data-mark', 'dot');
    // Highlight from the tray brings up the colour row on the bar
    pickTool('highlight');
    cy.get('[data-testid="color-row"] [data-testid^="color-"]')
      .should('have.length', 6)
      .and('be.visible');
    cy.get('[data-testid="color-red"]').click();
    cell(3, 3).click().should('have.attr', 'data-hl-color', 'red');
    // undo stays on the bar
    cy.get('[data-testid="undo"]').click();
    cell(3, 3).should('not.have.attr', 'data-hl-color');
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
