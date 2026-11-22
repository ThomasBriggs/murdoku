import { openKey, pickTool, sel } from '../support/helpers';

const URL = '/?seed=cy-layout&d=easy';

describe('layout', () => {
  it('desktop 1280x900: board starts under the header and board plus legends fit without scrolling', () => {
    cy.viewport(1280, 900);
    cy.visit(URL);
    cy.get(sel('board')).should('be.visible');
    cy.get('header').then(($h) => {
      const headerBottom = $h[0]!.getBoundingClientRect().bottom;
      cy.get(sel('board')).then(($b) => {
        const gap = $b[0]!.getBoundingClientRect().top - headerBottom;
        cy.log(`board starts ${Math.round(gap)}px under the header`);
        expect(gap).to.be.lessThan(141);
      });
    });
    cy.get(sel('board')).then(($b) => {
      const r = $b[0]!.getBoundingClientRect();
      cy.log(`board spans ${Math.round(r.top)}..${Math.round(r.bottom)}px`);
      expect(r.bottom, 'board fully above the fold').to.be.lessThan(901);
    });
    cy.get(sel('room-legend')).should('not.exist');
    cy.window().its('scrollY').should('eq', 0);
    // The furniture key is a collapsed section in the clue drawer and opens inside the viewport.
    cy.get(sel('furniture-legend')).should('not.exist');
    openKey();
    cy.get(sel('furniture-legend')).then(($l) => {
      const bottom = $l[0]!.getBoundingClientRect().bottom;
      cy.log(`furniture legend ends at ${Math.round(bottom)}px`);
      expect(bottom).to.be.lessThan(901);
    });
    // The tool palette is a horizontal dock below the board, in one row.
    cy.get(sel('tool-place')).then(($a) => {
      cy.get(sel('tool-cross')).then(($b) => {
        const a = $a[0]!.getBoundingClientRect();
        const b = $b[0]!.getBoundingClientRect();
        expect(Math.abs(a.top - b.top)).to.be.lessThan(2);
        expect(b.left).to.be.greaterThan(a.left);
      });
    });
    cy.get(sel('dock')).then(($d) => {
      cy.get(sel('board')).then(($b) => {
        expect($d[0]!.getBoundingClientRect().top).to.be.at.least(
          $b[0]!.getBoundingClientRect().bottom - 1,
        );
      });
    });
  });

  // Regression: the drawing layer used to claim an extra grid row, so the page scrolled into
  // empty space. The document must never be taller than the window.
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [375, 667],
  ] as const) {
    it(`${w}x${h}: the page does not scroll into empty space`, () => {
      cy.viewport(w, h);
      cy.visit(URL);
      cy.get(sel('board')).should('be.visible');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollHeight, 'scrollHeight').to.be.at.most(
          doc.defaultView!.innerHeight + 1,
        );
        expect(doc.documentElement.scrollWidth, 'scrollWidth').to.be.at.most(
          doc.defaultView!.innerWidth,
        );
      });
      cy.window().its('scrollY').should('eq', 0);
    });
  }

  it('row, column and room note fields are gone', () => {
    cy.visit(URL);
    cy.get(sel('board')).should('be.visible');
    cy.get('[data-testid^="row-note"]').should('not.exist');
    cy.get('[data-testid^="col-note"]').should('not.exist');
    cy.get('[data-testid="row-notes"], [data-testid="col-notes"]').should('not.exist');
    cy.get('[data-testid^="room-note"]').should('not.exist');
    cy.get(sel('room-legend')).should('not.exist');
  });

  it('desktop colour swatches only show for the highlight and draw tools', () => {
    cy.viewport(1280, 900);
    cy.visit(URL);
    cy.get(sel('color-red')).should('not.exist');
    pickTool('highlight');
    cy.get(sel('color-red')).should('be.visible');
    pickTool('cross');
    cy.get(sel('color-red')).should('not.exist');
  });

  for (const w of [360, 375, 414]) {
    it(`mobile ${w}px: header fits in one or two rows with no horizontal scroll`, () => {
      cy.viewport(w, 740);
      cy.visit(URL);
      cy.get(sel('board')).should('be.visible');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(w);
      });
      cy.get('header').then(($h) => {
        expect($h[0]!.getBoundingClientRect().height).to.be.lessThan(125);
        expect($h[0]!.scrollWidth).to.be.at.most($h[0]!.clientWidth);
      });
      for (const id of ['new-game-button', 'share-button', 'stats-button', 'rules-button'])
        cy.get(sel(id)).should('be.visible');
    });
  }
});
