import { sel } from '../support/helpers';

const URL = '/?seed=cy-scratch&d=easy';
/** The panel, once its open/close animation has finished (so its box can be measured). */
const panel = () =>
  cy.get(sel('scratchpad-panel')).should(($p) => {
    expect($p[0]!.getAnimations(), 'running animations').to.have.length(0);
  });
const fab = () =>
  cy.get(sel('scratchpad-toggle')).should(($f) => {
    expect($f[0]!.getAnimations(), 'running animations').to.have.length(0);
  });

function load() {
  cy.visit(URL);
  cy.get(sel('board')).should('be.visible');
}

/** Press, move and release a pointer on an element, in viewport pixels relative to its centre. */
function dragBy(testId: string, dx: number, dy: number) {
  cy.get(sel(testId)).then(($el) => {
    const r = $el[0]!.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const at = (px: number, py: number) => ({
      clientX: px,
      clientY: py,
      pointerId: 7,
      button: 0,
      force: true,
    });
    cy.wrap($el).trigger('pointerdown', at(x, y));
    cy.wrap($el).trigger('pointermove', at(x + dx / 2, y + dy / 2));
    cy.wrap($el).trigger('pointermove', at(x + dx, y + dy));
    cy.wrap($el).trigger('pointerup', at(x + dx, y + dy));
  });
}

const rectOf = ($p: JQuery<HTMLElement>) => $p[0]!.getBoundingClientRect();

describe('scratchpad', () => {
  it('starts as a button, opens a panel with the text focused, and minimises with the button', () => {
    load();
    cy.get(sel('scratchpad-panel')).should('not.exist');
    fab().should('have.attr', 'aria-expanded', 'false').and('not.have.attr', 'data-has-text');
    fab().click();
    panel().should('be.visible');
    cy.get(sel('scratchpad-text')).should('have.focus');
    cy.get(sel('scratchpad-toggle')).should('have.attr', 'aria-expanded', 'true').click();
    cy.get(sel('scratchpad-panel')).should('not.exist');
    fab().should('have.focus');
  });

  it('Escape minimises and returns focus to the button', () => {
    load();
    fab().click();
    cy.get(sel('scratchpad-text')).type('{esc}');
    cy.get(sel('scratchpad-panel')).should('not.exist');
    fab().should('have.focus');
  });

  it('keeps typed text, marks the button with a has-text indicator, and shortcuts stay off while typing', () => {
    load();
    fab().click();
    cy.get(sel('scratchpad-text')).type('If C then F. xnpd');
    cy.get('body').should('not.have.attr', 'data-tool', 'cross');
    cy.get(sel('board')).should('have.attr', 'data-tool', 'place');
    fab().click(); // minimise: commits
    fab().should('have.attr', 'data-has-text', 'true');
    fab().click();
    cy.get(sel('scratchpad-text')).should('have.value', 'If C then F. xnpd');
  });

  it('undo takes the committed text back', () => {
    load();
    fab().click();
    cy.get(sel('scratchpad-text')).type('hello');
    cy.get(sel('scratchpad-text')).blur();
    cy.get(sel('undo')).click();
    cy.get(sel('scratchpad-text')).should('have.value', '');
  });

  it('is dragged by its header and resized by its handle, staying inside the window', () => {
    load();
    fab().click();
    panel().then(($p) => {
      const before = rectOf($p);
      dragBy('scratchpad-drag', 120, -60);
      panel().should(($q) => {
        const after = rectOf($q);
        expect(Math.round(after.left - before.left)).to.eq(120);
        expect(Math.round(after.top - before.top)).to.eq(-60);
        expect(Math.round(after.width)).to.eq(Math.round(before.width));
      });
    });
    panel().then(($p) => {
      const before = rectOf($p);
      dragBy('scratchpad-resize', 60, 40);
      panel().should(($q) => {
        const after = rectOf($q);
        expect(Math.round(after.width - before.width)).to.eq(60);
        expect(Math.round(after.height - before.height)).to.eq(40);
        expect(Math.round(after.left)).to.eq(Math.round(before.left));
      });
    });
    // dragged far off the edge: it is clamped inside the viewport
    dragBy('scratchpad-drag', 5000, 5000);
    cy.window().then((win) => {
      panel().should(($p) => {
        const r = rectOf($p);
        expect(r.right).to.be.at.most(win.innerWidth);
        expect(r.bottom).to.be.at.most(win.innerHeight);
      });
    });
  });

  it('dragging the button moves it without opening the panel', () => {
    load();
    fab().then(($f) => {
      const before = rectOf($f);
      dragBy('scratchpad-toggle', 200, -100);
      cy.get(sel('scratchpad-panel')).should('not.exist');
      fab().should(($g) => {
        const after = rectOf($g);
        expect(Math.round(after.left - before.left)).to.eq(200);
        expect(Math.round(after.top - before.top)).to.eq(-100);
      });
    });
  });

  it('a reload keeps the text, the open state and the panel position', () => {
    load();
    fab().click();
    cy.get(sel('scratchpad-text')).type('the cook did it');
    cy.get(sel('scratchpad-text')).blur();
    dragBy('scratchpad-drag', 100, -80);
    dragBy('scratchpad-resize', 40, 30);
    panel().then(($p) => {
      const placed = rectOf($p);
      cy.reload();
      cy.get(sel('board')).should('be.visible');
      panel().should('be.visible');
      cy.get(sel('scratchpad-text')).should('have.value', 'the cook did it');
      panel().should(($q) => {
        const r = rectOf($q);
        expect(Math.round(r.left)).to.eq(Math.round(placed.left));
        expect(Math.round(r.top)).to.eq(Math.round(placed.top));
        expect(Math.round(r.width)).to.eq(Math.round(placed.width));
        expect(Math.round(r.height)).to.eq(Math.round(placed.height));
      });
    });
  });

  it('a minimised pad stays minimised, in its place, after a reload', () => {
    load();
    fab().then(($f) => {
      const before = rectOf($f);
      dragBy('scratchpad-toggle', 150, -150);
      const left = Math.round(before.left + 150);
      const top = Math.round(before.top - 150);
      fab().should(($g) => {
        expect(Math.round(rectOf($g).left)).to.eq(left);
        expect(Math.round(rectOf($g).top)).to.eq(top);
      });
      cy.reload();
      cy.get(sel('board')).should('be.visible');
      cy.get(sel('scratchpad-panel')).should('not.exist');
      fab().should(($g) => {
        expect(Math.round(rectOf($g).left)).to.eq(left);
        expect(Math.round(rectOf($g).top)).to.eq(top);
      });
    });
  });

  it('works on a phone: opens inside the screen and fits the width', () => {
    cy.viewport(375, 740);
    load();
    fab().click();
    panel().should(($p) => {
      const r = rectOf($p);
      expect(r.left).to.be.at.least(0);
      expect(r.right).to.be.at.most(375);
      expect(r.bottom).to.be.at.most(740);
    });
    cy.get(sel('scratchpad-text')).type('on a phone');
    cy.get(sel('scratchpad-text')).should('have.value', 'on a phone');
  });
});
