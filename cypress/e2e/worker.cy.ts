describe('engine worker', () => {
  it('generates a puzzle from the URL seed without exposing the solution', () => {
    cy.visit('/?seed=cy-test&d=easy');
    cy.get('[data-testid="puzzle-status"]').should('contain.text', 'playing');
    cy.get('[data-testid="puzzle-status"]').should('contain.text', 'cy-test');
    cy.get('[data-testid="puzzle-error"]').should('not.exist');
    // The solution lives only in the worker: nothing solution-like on the main thread globals.
    cy.window().then((win) => {
      const w = win as unknown as Record<string, unknown>;
      for (const k of ['solution', '__solution', '__murdoku', 'murdererId'])
        expect(w[k], k).to.equal(undefined);
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.outerHTML).not.to.match(/murdererId|cellOf/);
    });
  });

  it('falls back to medium and a random seed with no params', () => {
    cy.visit('/');
    cy.get('[data-testid="puzzle-status"]').should('contain.text', 'playing');
    cy.get('[data-testid="puzzle-status"]')
      .invoke('text')
      .should('match', /seed: \w+/);
  });
});

export {};
