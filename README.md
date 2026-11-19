# Murdoku

A murder-mystery logic puzzle that runs entirely in your browser. No backend, no accounts: everything, including puzzle generation, happens on your device.

## The rules

- The 9x9 floor plan is split into rooms by thick walls. Nine people (the victim and eight suspects) must each stand on the board.
- Like Sudoku, **no two people share a row or a column**.
- Some furniture blocks a cell (nobody can stand there); other furniture can be stood on or beside.
- Each person comes with a clue (a room, furniture, a row or column, who is next to whom). Use them to place everyone.
- The victim's room contains exactly one suspect: the murderer. Once all nine are placed, **accuse** a suspect.
- Hints (a logical solver explains the next deduction), checks and a full set of "paper" tools (marks, candidate notes, highlights, pen, logic grid, what-if branches, scratchpad) are built in. Press the `?` button in the app for the full rules and keyboard shortcuts.

Puzzles are generated from a seed, so `?seed=abc&d=hard` always gives the same puzzle. Use the share link to send one to a friend.

## Scripts

Node is pinned in `.node-version`.

| Script                            | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                                  |
| `npm run build`                   | Typecheck and production build into `dist/`                      |
| `npm run preview`                 | Serve `dist/` on http://localhost:4173                           |
| `npm run typecheck`               | TypeScript (app, tests)                                          |
| `npm run typecheck:e2e`           | TypeScript for the Cypress specs                                 |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                |
| `npm test`                        | Vitest (engine, store, UI)                                       |
| `npm run e2e`                     | Build, start the preview server, run Cypress headless in Firefox |
| `npm run e2e:electron`            | Same, in Electron                                                |
| `npm run e2e:open`                | Interactive Cypress                                              |

## Testing

- **Vitest** covers the pure engine (determinism, uniqueness, solver difficulty over hundreds of seeds, clue text), the store, persistence and the React UI.
- **Cypress** specs in `cypress/e2e/` cover the game flow, toolkit, persistence, worker, layout (above-the-fold at 1280x900, no horizontal overflow at 360-414 px), dialog focus handling and accessibility (cypress-axe, light and dark, desktop and mobile). Select elements by `data-testid`.
- Visual review screenshots: `npm run build`, then
  `npx start-server-and-test preview http://localhost:4173 'cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts'`.

## Architecture

- `src/engine`: pure TypeScript (no DOM, no React): floor plans, furniture, solution placement, clue generation, logical solver, difficulty grading. Deterministic from the seed.
- `src/worker`: a Web Worker wraps the engine. `src/worker/client.ts` is the only door the UI uses.
- `src/state`: Zustand + immer store with undo/redo, annotations, persistence and statistics.
- `src/ui`: React components, CSS modules, hand-made SVG furniture icons, light/dark themes, print stylesheet.

### Where the solution lives

The solution exists only inside the worker. The worker posts the UI a `PuzzleView` (grid, rooms, furniture, people, clues, seed) with **no solution field**. Checks, hints and accusations are messages to the worker, which replies only with correct/incorrect or the next deduction. localStorage stores only the seed, generator version and the player's own progress; on reload the worker regenerates the puzzle from the seed, so no answer is ever written to storage. The view also carries a SHA-256 of seed plus canonical placement so a win can be verified without the answer. A determined player can still run the generator, which is acceptable.

## Deployment

`npm run build` produces a static `dist/`. Vite is configured with `base: './'`, so it works from any path with no server configuration, and the worker loads relative to the page.

The site is deployed only via Cloudflare Pages. `.github/workflows/ci.yml` runs typecheck, lint, tests, build and the Cypress suite on pushes and pull requests; it does not deploy.

### Deploy to Cloudflare Pages

1. In the Cloudflare dashboard go to Workers & Pages > Create > Pages > Connect to Git and pick the repository.
2. Framework preset: None (or Vite). Build command: `npm run build`. Build output directory: `dist`. Root directory: `/`.
3. Add the environment variable `CYPRESS_INSTALL_BINARY=0` to skip the roughly 200 MB Cypress download during the build.
4. The Node version comes from `.node-version`.

No backend or functions are needed. `public/_headers` is copied into `dist/` and sets long-lived immutable caching for `/assets/*` plus basic security headers.
