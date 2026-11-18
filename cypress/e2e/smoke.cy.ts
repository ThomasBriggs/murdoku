describe('smoke', () => {
  it('renders the app title', () => {
    cy.visit('/');
    cy.get('[data-testid="app-title"]').should('contain.text', 'Murdoku');
  });
});

export {};
