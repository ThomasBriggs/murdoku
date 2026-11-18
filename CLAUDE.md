# Murdoku – working notes for agents

- The source of truth for behaviour is `SPEC.md`. Follow it; if something in it is ambiguous, pick the simplest reading and note it in your report.
- Node is installed via nvm and is NOT on the non-interactive PATH. Prefix shell commands with:
  `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`
- Display: no Xvfb is installed, but `DISPLAY=:0` (XWayland) is available, so `cypress run` works headless using it.
- Package manager: npm.
- Scripts: `npm run dev`, `npm run build`, `npm test` (Vitest, run once), `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e` (type-checks the Cypress specs), `npm run e2e` (build, Vite preview server, Cypress headless in **Firefox**), `npm run e2e:electron` (same in Electron), `npm run e2e:open`.
- Use `timeout` on long commands (e.g. `timeout 900 npm run e2e`) and leave no background processes running.
- Screenshots for visual review (run last, after a build): `npx start-server-and-test preview http://localhost:4173 'cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts'`; images land in `cypress/screenshots/` (git-ignored).

## E2E browser choice

Measured on this machine, full suite (`cypress run`, after the build), two runs each: Electron 95 s and 95 s, Firefox 99 s and 99 s, all 86 tests green both ways, so speed is a wash. The difference is failure behaviour: with Electron, `cy.screenshot()` on a failed test hangs until its 30 s timeout (and again for the run-failure screenshot), so a failing run took about 175 s and the real error was buried. Firefox fails fast with a clean message. Hence `npm run e2e` defaults to Firefox. Electron defaults to the dark colour scheme and Firefox to light, so the axe specs set the theme explicitly (`setTheme`) and cover both.

## Commits

- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `chore: …`, `docs: …`, `refactor(scope): …`.
  Scopes: `engine`, `clues`, `solver`, `worker`, `ui`, `toolkit`, `game`, `persist`, `e2e`, `build`, `a11y`, `perf`, `ci`.
- Commit in small logical steps as you go (not one giant commit). Never commit failing tests or a broken build.
- End every commit message with a blank line then the attribution line given in your system instructions.
- Do not rewrite history (no amend/rebase/force) on commits already made.

## Quality bar

- TypeScript strict, no `any` unless justified in a comment.
- `src/engine` must stay pure: no DOM, no React, no worker APIs.
- The solution must never reach the main thread (SPEC §7): UI code must not import solution types or the generator directly; it talks to the worker via `src/worker/client.ts`.
- Every feature ships with Vitest unit tests; every user-facing feature also with a Cypress spec in `cypress/e2e/`.
- Before finishing: `npm run typecheck && npm run typecheck:e2e && npm run lint && npm test && npm run build && npm run e2e` must all pass.

## Testing conventions

- Select elements in Cypress and Testing Library tests via `data-testid` attributes (e.g. `cy.get('[data-testid="app-title"]')`), not CSS classes or text.
- Vitest: tests live in `tests/` (e.g. `tests/engine/*.test.ts`) or colocated as `*.test.ts(x)`; jsdom environment, jest-dom matchers loaded from `tests/setup.ts`.
