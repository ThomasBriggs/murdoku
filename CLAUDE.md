# Murdoku – working notes for agents

- The source of truth for behaviour is `SPEC.md`. Follow it; if something in it is ambiguous, pick the simplest reading and note it in your report.
- Node is installed via nvm and is NOT on the non-interactive PATH. Prefix shell commands with:
  `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`
- Display: no Xvfb is installed, but `DISPLAY=:0` (XWayland) is available, so `cypress run` works headless using it.
- Package manager: npm.
- Scripts (once scaffolded): `npm run dev`, `npm run build`, `npm test` (Vitest, run once), `npm run lint`, `npm run typecheck`, `npm run e2e` (starts the Vite preview server and runs Cypress headless).

## Commits
- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `chore: …`, `docs: …`, `refactor(scope): …`.
  Scopes: `engine`, `clues`, `solver`, `worker`, `ui`, `toolkit`, `game`, `persist`, `e2e`, `build`.
- Commit in small logical steps as you go (not one giant commit). Never commit failing tests or a broken build.
- End every commit message with a blank line then:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Do not rewrite history (no amend/rebase/force) on commits already made.

## Quality bar
- TypeScript strict, no `any` unless justified in a comment.
- `src/engine` must stay pure: no DOM, no React, no worker APIs.
- The solution must never reach the main thread (SPEC §7): UI code must not import solution types or the generator directly; it talks to the worker via `src/worker/client.ts`.
- Every feature ships with Vitest unit tests; every user-facing feature also with a Cypress spec in `cypress/e2e/`.
- Before finishing: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` must all pass.
