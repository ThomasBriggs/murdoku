// Visual review shots. Cypress's Electron screenshot capture hangs in some headless
// setups, so these only run on request:
//   cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts
import {
  closeClues,
  moreClick,
  openClues,
  placePerson,
  selectPerson,
  setTheme as sharedSetTheme,
  solveFromSeed,
} from '../support/helpers';

const URL = '/?seed=cy-board&d=easy';
const cell = (r: number, c: number) => cy.get(`[data-testid="cell-${r}-${c}"]`);

/** On mobile widths the less-used controls live in the "More" sheet. */
function inMore(w: number, action: () => void) {
  if (w > 600) return action();
  cy.get('[data-testid="more-button"]').click();
  action();
  cy.get('body').then(($b) => {
    if ($b.find('[data-testid="more-close"]').length) cy.get('[data-testid="more-close"]').click();
  });
}

const suite = Cypress.expose('SCREENSHOTS') ? describe : describe.skip;
suite('board screenshots', () => {
  for (const [name, w, h] of [
    ['desktop', 1280, 900],
    ['mobile', 375, 740],
  ] as const)
    for (const theme of ['light', 'dark'] as const)
      it(`${name} ${theme}`, () => {
        cy.viewport(w, h);
        cy.visit(URL);
        cy.get('[data-testid="board"]').should('be.visible');
        setTheme(w, theme);
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
        // (the clue drawer is closed on phones, so there is no clue word to hover there)
        if (w >= 1200)
          cy.get('[data-testid^="clue-room-"]').first().trigger('mouseover').trigger('mouseenter');
        cy.screenshot(`board-${name}-${theme}`, { capture: 'fullPage' });
      });
});

suite('toolkit screenshots', () => {
  for (const [name, w, h, theme] of [
    ['desktop', 1280, 900, 'light'],
    ['mobile', 375, 740, 'dark'],
  ] as const)
    it(`toolkit ${name} ${theme}`, () => {
      cy.viewport(w, h);
      cy.visit('/?seed=cy-marks&d=easy');
      cy.get('[data-testid="board"]').should('be.visible');
      setTheme(w, theme);
      // crosses, dots and a question mark
      cy.get('[data-testid="tool-cross"]').click();
      for (const [r, c] of [
        [0, 0],
        [0, 1],
        [1, 4],
        [5, 5],
      ])
        cell(r!, c!).click();
      inMore(w, () => cy.get('[data-testid="tool-dot"]').click());
      cell(2, 2).click();
      inMore(w, () => cy.get('[data-testid="tool-unsure"]').click());
      cell(3, 3).click();
      // highlights in three colours
      for (const [colour, cells] of [
        [
          'amber',
          [
            [4, 0],
            [4, 1],
            [4, 2],
          ],
        ],
        [
          'blue',
          [
            [6, 6],
            [6, 7],
          ],
        ],
        [
          'green',
          [
            [8, 2],
            [7, 2],
          ],
        ],
      ] as const) {
        cy.get('[data-testid="tool-highlight"]').click();
        cy.get(`[data-testid="color-${colour}"]`).click();
        for (const [r, c] of cells) cell(r, c).click();
      }
      // candidates and an eliminated initial
      cy.get('[data-testid="tool-place"]').click(); // quick taps note candidates
      for (const id of [1, 2, 3]) {
        selectPerson(id);
        for (const [r, c] of [
          [2, 6],
          [2, 7],
          [7, 0],
        ])
          cell(r!, c!).click();
      }
      inMore(w, () => cy.get('[data-testid="tool-eliminate"]').click());
      cell(2, 6).click();
      selectPerson(2);
      cell(7, 0).click();
      // a tentative guess
      cy.get('[data-testid="tool-pencil"]').click();
      selectPerson(4);
      cell(1, 7).click();
      // a room note
      cy.get('[data-testid^="room-note-btn-"]').first().click();
      cy.get('[data-testid^="room-note-input-"]').type('victim + 1{enter}');
      cy.get('[data-testid="tool-place"]').click();
      cy.screenshot(`toolkit-${name}-${theme}`, { capture: 'fullPage' });
    });
});

suite('tentative close-up', () => {
  it('tentative token next to a placed token', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-marks&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').then(($cells) => {
      const free = $cells
        .toArray()
        .map((el) => [Number(el.dataset.r), Number(el.dataset.c)] as [number, number]);
      placePerson(0, free[0]![0], free[0]![1]);
      cy.get('[data-testid="tool-pencil"]').click();
      selectPerson(4);
      cell(free[1]![0], free[1]![1]).click();
      selectPerson(5);
      cell(free[2]![0], free[2]![1]).click();
    });
    cy.get('[data-testid="tool-place"]').click();
    cy.get('[data-testid^="tentative-"]').first().scrollIntoView();
    cy.get('[data-testid="board"]').screenshot('tentative-closeup', { capture: 'viewport' });
  });
});

suite('focus layout screenshots', () => {
  const t = (id: string) => `[data-testid="${id}"]`;

  /** Place the first `n` people (by card) on free cells in distinct rows. */
  function placeSome(n: number) {
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').then(($cells) => {
      const used = new Set<number>();
      let k = 0;
      for (const el of $cells.toArray()) {
        const r = Number(el.dataset.r);
        if (k >= n || used.has(r)) continue;
        used.add(r);
        placePerson(k, r, Number(el.dataset.c));
        k++;
      }
    });
  }

  for (const [name, w, h] of [
    ['desktop', 1280, 900],
    ['mobile', 375, 740],
  ] as const) {
    it(`scratchpad open ${name}`, () => {
      cy.viewport(w, h);
      cy.visit(URL);
      cy.get(t('board')).should('be.visible');
      cy.get(t('scratchpad-toggle')).click();
      cy.get(t('scratchpad-text')).type('If Margaret is in the Kitchen then Leonard is in row 3.');
      cy.get(t('scratchpad-panel')).should('be.visible');
      cy.screenshot(`scratchpad-open-${name}`, { capture: 'viewport' });
    });

    it(`clues drawer, Placed collapsed ${name}`, () => {
      cy.viewport(w, h);
      cy.visit(URL);
      cy.get(t('board')).should('be.visible');
      placeSome(3);
      openClues();
      cy.get(t('clues-placed-toggle')).click().should('have.attr', 'aria-expanded', 'false');
      cy.get(t('clues-placed-list')).should('not.be.visible');
      cy.screenshot(`clues-placed-collapsed-${name}`, { capture: 'viewport' });
      if (w < 1200) closeClues();
    });
  }
});

function setTheme(_w: number, theme: 'light' | 'dark') {
  sharedSetTheme(theme);
}

function logicMarks() {
  for (const [t, s, i, n] of [
    ['rooms', 0, 0, 2],
    ['rooms', 0, 1, 1],
    ['rooms', 0, 2, 1],
    ['rooms', 1, 1, 2],
    ['rooms', 2, 0, 1],
    ['rows', 0, 3, 2],
    ['rows', 1, 0, 1],
    ['cols', 2, 4, 2],
    ['cols', 3, 4, 1],
  ] as const)
    for (let k = 0; k < n; k++) cy.get(`[data-testid="logic-${t}-${s}-${i}"]`).click();
}

suite('advanced toolkit screenshots', () => {
  it('logic grid desktop light', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(1280, 'light');
    cy.get('body').type('g');
    logicMarks();
    cy.get('[data-testid="logic-grid"]').scrollIntoView();
    cy.screenshot('logic-grid-desktop-light', { capture: 'fullPage' });
  });

  it('pen drawing and what-if banner desktop dark', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(1280, 'dark');
    cy.get('body').type('w');
    selectPerson(1);
    cy.get('[data-testid="board-grid"] [data-blocked="false"]').first().click();
    cy.get('body').type('d');
    const stroke = (pts: [number, number][]) =>
      cy.get('[data-testid="drawing-layer"]').then(($l) => {
        const rect = $l[0]!.getBoundingClientRect();
        const at = ([x, y]: [number, number]) => ({
          clientX: rect.left + rect.width * x,
          clientY: rect.top + rect.height * y,
          pointerId: 1,
          button: 0,
          force: true,
        });
        cy.wrap($l).trigger('pointerdown', at(pts[0]!));
        for (const p of pts.slice(1)) cy.wrap($l).trigger('pointermove', at(p));
        cy.wrap($l).trigger('pointerup', at(pts[pts.length - 1]!));
      });
    cy.get('[data-testid="color-red"]').click();
    // a circle around a few cells, then an arrow
    const circle: [number, number][] = Array.from({ length: 25 }, (_, i) => [
      0.3 + 0.16 * Math.cos((i / 24) * 2 * Math.PI),
      0.35 + 0.12 * Math.sin((i / 24) * 2 * Math.PI),
    ]);
    stroke(circle);
    cy.get('[data-testid="color-blue"]').click();
    stroke([
      [0.5, 0.75],
      [0.7, 0.62],
      [0.65, 0.64],
      [0.7, 0.62],
      [0.69, 0.68],
    ]);
    cy.get('[data-testid="pen-highlighter"]').click();
    cy.get('[data-testid="color-amber"]').click();
    stroke([
      [0.1, 0.9],
      [0.6, 0.9],
    ]);
    cy.get('body').type('{esc}');
    cy.screenshot('pen-whatif-desktop-dark', { capture: 'fullPage' });
  });

  it('logic grid sheet mobile light', () => {
    cy.viewport(375, 740);
    cy.visit('/?seed=cy-adv&d=easy');
    cy.get('[data-testid="board"]').should('be.visible');
    setTheme(375, 'light');
    moreClick('logic-toggle');
    cy.get('[data-testid="logic-grid"]').should('be.visible');
    logicMarks();
    cy.get('[data-testid="logic-grid"]').scrollTo('top');
    cy.screenshot('logic-grid-mobile-light', { capture: 'viewport' });
  });
});

suite('game flow screenshots', () => {
  const t = (id: string) => `[data-testid="${id}"]`;

  it('win dialog desktop dark', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-flow&d=easy');
    cy.get(t('board')).should('be.visible');
    setTheme(1280, 'dark');
    solveFromSeed();
    cy.get(t('accuse-button')).click();
    const tryNext = (ids: string[], i = 0) => {
      cy.get(t(`accuse-suspect-${ids[i]}`)).check();
      cy.get(t('accuse-confirm')).click();
      cy.get(`${t('win-dialog')}, ${t('accuse-result')}`).then(($el) => {
        if ($el.attr('data-testid') !== 'win-dialog') tryNext(ids, i + 1);
      });
    };
    cy.get('[data-testid^="accuse-suspect-"]').then(($r) =>
      tryNext($r.toArray().map((el) => el.dataset.testid!.replace('accuse-suspect-', ''))),
    );
    cy.get(t('win-dialog')).should('be.visible');
    cy.screenshot('win-desktop-dark', { capture: 'viewport' });
  });

  it('rules dialog mobile light', () => {
    cy.viewport(375, 740);
    cy.visit('/?seed=cy-flow&d=easy');
    cy.get(t('board')).should('be.visible');
    setTheme(375, 'light');
    cy.get(t('rules-button')).click();
    cy.get(t('rules-dialog')).should('be.visible');
    cy.screenshot('rules-mobile-light', { capture: 'viewport' });
  });

  it('stats dialog desktop light', () => {
    cy.viewport(1280, 900);
    cy.visit('/?seed=cy-flow&d=easy', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'murdoku:v1:stats',
          JSON.stringify({
            played: 7,
            won: 5,
            streak: 3,
            bestStreak: 4,
            bestTimeMs: { easy: 214000, medium: 487000, hard: null },
          }),
        );
      },
    });
    cy.get(t('board')).should('be.visible');
    setTheme(1280, 'light');
    cy.get(t('stats-button')).click();
    cy.get(t('stats-dialog')).should('be.visible');
    cy.screenshot('stats-desktop-light', { capture: 'viewport' });
  });
});
export {};
