import 'cypress-axe';
// Specs run as a returning visitor (the Rules dialog does not open by itself) unless a
// spec sets `globalThis.murdokuFirstVisit = true` (Cypress 16 removed the mutable Cypress.env).
declare global {
  var murdokuFirstVisit: boolean | undefined;
}
Cypress.on('window:before:load', (win) => {
  if (!globalThis.murdokuFirstVisit) win.localStorage.setItem('murdoku:v1:seenRules', 'true');
});
export {};
