import { defineConfig } from 'cypress';

export default defineConfig({
  video: false,
  viewportWidth: 1280,
  viewportHeight: 800,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: 'http://localhost:4173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on) {
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
