import {
  gesture,
  longPress,
  openSettings,
  playToWin,
  sel,
  tid,
  visitWithQuickBar,
} from '../support/helpers';

const A = '/?seed=cy-persist-a&d=easy';
const B = '/?seed=cy-persist-b&d=medium';
const CURRENT = 'murdoku:v1:current';

type Saved = {
  seed: string;
  elapsedMs: number;
  generatorVersion: number;
  whatIfStack: unknown[];
  placements: Record<string, number | null>;
};

function load(url = A) {
  visitWithQuickBar(url);
  cy.get(sel('board')).should('be.visible');
}

/** Wait until the debounced save satisfies `ok` (retries), then yield it. */
function saved(ok: (s: Saved) => boolean = () => true, timeout = 4000): Cypress.Chainable<Saved> {
  return cy
    .window({ timeout })
    .should((win) => {
      const raw = win.localStorage.getItem(CURRENT);
      expect(raw, 'saved game').to.be.a('string');
      expect(ok(JSON.parse(raw!) as Saved), 'save satisfies the condition').to.eq(true);
    })
    .then((win) => JSON.parse(win.localStorage.getItem(CURRENT)!) as Saved);
}

function placeOne() {
  tid('person-card-1').click();
  cy.get('[data-testid="board-grid"] [data-blocked="false"]')
    .first()
    .then(($c) => longPress(Number($c[0]!.dataset.r), Number($c[0]!.dataset.c)));
}

describe('persistence', () => {
  it('restores placements, marks, candidates, a stroke, scratchpad and a what-if; undo works after reload', () => {
    load();
    // placement
    tid('person-card-1').click();
    cy.get('[data-testid="board-grid"] [data-blocked="false"]')
      .eq(0)
      .then(($c) => longPress(Number($c[0]!.dataset.r), Number($c[0]!.dataset.c)));
    cy.get('[data-testid="board-grid"] [data-occupant="1"]').should('have.length', 1);
    // cross mark
    tid('tool-cross').click();
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').eq(5).click();
    // candidate
    tid('tool-place').click();
    tid('person-card-2').click();
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').eq(8).click();
    // pen stroke
    tid('tool-draw').click();
    gesture([
      [0.2, 0.2],
      [0.35, 0.3],
      [0.5, 0.2],
      [0.65, 0.4],
    ]);
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 1);
    cy.get('body').type('{esc}');
    // scratchpad
    tid('scratchpad-toggle').click();
    tid('scratchpad-text').type('the cook did it');
    tid('scratchpad-toggle').click();
    // what-if
    cy.get('body').type('w');
    tid('whatif-level').should('have.text', 'What-if (level 1)');
    saved((s) => s.whatIfStack.length === 1);

    cy.reload();
    cy.get(sel('board')).should('be.visible');
    cy.get('[data-testid="board-grid"] [data-occupant="1"]').should('have.length', 1);
    cy.get('[data-testid^="mark-"]').should('have.length', 1);
    cy.get('[data-testid^="cand-"]').should('have.length', 1);
    cy.get('[data-testid="drawing-layer"] path[data-testid^="stroke-"]').should('have.length', 1);
    tid('scratchpad-toggle').click();
    tid('scratchpad-text').should('have.value', 'the cook did it');
    tid('scratchpad-toggle').click();
    tid('whatif-level').should('have.text', 'What-if (level 1)');
    // undo history survived: the first undo rolls back the what-if start
    tid('undo').click();
    tid('whatif-banner').should('not.exist');
    tid('undo').click(); // scratchpad text
    tid('scratchpad-toggle').click();
    tid('scratchpad-text').should('have.value', '');
  });

  it('continues the timer from the saved value', () => {
    load();
    placeOne();
    // the timer alone is saved every 5 s, so allow for that
    saved((s) => s.elapsedMs >= 2000 && s.placements['1'] !== null, 15000).then((s) => {
      cy.reload();
      cy.get(sel('board')).should('be.visible');
      tid('timer').should(($t) => {
        const [m, sec] = $t.text().split(':').map(Number);
        expect(m! * 60 + sec!).to.be.gte(Math.floor(s.elapsedMs / 1000));
      });
      tid('timer').should('have.attr', 'data-running', 'true');
    });
  });

  it('keeps settings across a reload', () => {
    load();
    openSettings();
    tid('theme-dark').check();
    tid('setting-autocross').uncheck();
    cy.reload();
    cy.get(sel('board')).should('be.visible');
    cy.get('html').should('have.attr', 'data-theme', 'dark');
    openSettings();
    tid('theme-dark').should('be.checked');
    tid('setting-autocross').should('not.be.checked');
  });

  it('shared URL while a saved game has progress: choose, and both choices work', () => {
    load(A);
    placeOne();
    saved((s) => s.placements['1'] !== null);
    cy.visit(B);
    tid('startup-choose').should('be.visible');
    tid('startup-continue').click();
    tid('puzzle-seed').should('have.text', 'cy-persist-a');
    cy.get('[data-testid="board-grid"] [data-occupant="1"]').should('have.length', 1);
    cy.location('search').should('eq', '?seed=cy-persist-a&d=easy');

    cy.visit(B);
    tid('startup-choose').should('be.visible');
    tid('startup-shared').click();
    tid('puzzle-seed').should('have.text', 'cy-persist-b');
    tid('puzzle-difficulty').should('have.text', 'medium');
    cy.get('[data-testid="board-grid"] [data-occupant]').each(($c) =>
      expect($c.attr('data-occupant')).to.eq(''),
    );
    // the abandoned game shows up in the stats
    tid('stats-button').click();
    tid('stats-played').should('have.text', '1');
    tid('stats-won').should('have.text', '0');
  });

  it('wins, reloads into the solved state, and shows the stats', () => {
    load();
    playToWin();
    tid('win-new-best').should('be.visible');
    tid('win-close').click();
    saved((s) => s.placements['1'] !== null);
    cy.reload();
    cy.get(sel('board')).should('have.attr', 'data-solved', 'true');
    tid('solved-banner').should('be.visible');
    tid('win-dialog').should('not.exist');
    tid('timer').should('have.attr', 'data-running', 'false');
    tid('stats-button').click();
    tid('stats-won').should('have.text', '1');
    tid('stats-played').should('have.text', '1');
    tid('stats-streak').should('have.text', '1');
    tid('stats-best-easy')
      .invoke('text')
      .should('match', /^\d\d:\d\d$/);
    // reset needs a confirmation
    tid('stats-reset').click();
    tid('stats-reset-yes').click();
    tid('stats-won').should('have.text', '0');
  });

  it('offers a new game when the generator version changed', () => {
    load();
    placeOne();
    saved((s) => s.placements['1'] !== null);
    // pretend the generator changed: edit the save just before the app loads
    cy.visit(A, {
      onBeforeLoad(win) {
        const s = JSON.parse(win.localStorage.getItem(CURRENT)!) as Saved;
        s.generatorVersion = 999;
        win.localStorage.setItem(CURRENT, JSON.stringify(s));
      },
    });
    tid('startup-outdated').should('be.visible').and('contain.text', 'generator was updated');
    tid('startup-outdated-new').click();
    cy.get(sel('board')).should('be.visible');
    cy.get('[data-testid="board-grid"] [data-occupant]').each(($c) =>
      expect($c.attr('data-occupant')).to.eq(''),
    );
  });

  it('shares a progress-free puzzle link from the header', () => {
    load();
    cy.window().then((win) => {
      const stub = cy.stub().as('copy');
      stub.resolves();
      Object.defineProperty(win.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: stub },
      });
    });
    placeOne();
    tid('share-button').click();
    cy.get('@copy').should('have.been.calledWithMatch', 'seed=cy-persist-a&d=easy');
    cy.get('@copy').should('not.have.been.calledWithMatch', 'placements');
  });
});

describe('first visit', () => {
  before(() => {
    globalThis.murdokuFirstVisit = true;
  });
  after(() => {
    globalThis.murdokuFirstVisit = false;
  });

  it('opens the rules once, not on the second visit', () => {
    cy.visit(A);
    tid('rules-dialog').should('be.visible');
    tid('rules-close').click();
    cy.reload();
    cy.get(sel('board')).should('be.visible');
    tid('rules-dialog').should('not.exist');
  });
});
