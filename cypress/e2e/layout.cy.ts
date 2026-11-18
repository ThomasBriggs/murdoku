import { sel } from '../support/helpers';

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
    cy.get(sel('furniture-legend')).then(($l) => {
      const bottom = $l[0]!.getBoundingClientRect().bottom;
      cy.log(`furniture legend ends at ${Math.round(bottom)}px`);
      expect(bottom).to.be.lessThan(901);
    });
    // The tool palette is a vertical strip beside the board, in one column.
    cy.get(sel('tool-place')).then(($a) => {
      cy.get(sel('tool-draw')).then(($b) => {
        const a = $a[0]!.getBoundingClientRect();
        const b = $b[0]!.getBoundingClientRect();
        expect(Math.abs(a.left - b.left)).to.be.lessThan(2);
        expect(b.top).to.be.greaterThan(a.top);
      });
    });
  });

  it('desktop colour swatches only show for the highlight and draw tools', () => {
    cy.viewport(1280, 900);
    cy.visit(URL);
    cy.get(sel('color-red')).should('not.exist');
    cy.get(sel('tool-highlight')).click();
    cy.get(sel('color-red')).should('be.visible');
    cy.get(sel('tool-cross')).click();
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
