# Murdoku – working notes for agents

- The source of truth for behaviour is `SPEC.md`. Follow it; if something in it is ambiguous, pick the simplest reading and note it in your report.
- Node is installed via nvm and is NOT on the non-interactive PATH. Prefix shell commands with:
  `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`
- Display: no Xvfb is installed, but `DISPLAY=:0` (XWayland) is available, so `cypress run` works headless using it.
- Package manager: npm.
- Scripts: `npm run dev`, `npm run build`, `npm test` (Vitest, run once), `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e` (type-checks the Cypress specs), `npm run e2e` (build, one Vite preview server, Cypress headless in **Firefox** split into 4 parallel shards; ~80 s vs ~210 s serial), `npm run e2e:run` (same without the build; `-- --shards N` or `E2E_SHARDS=N` to change the split), `npm run e2e:serial` (old one-process run), `npm run e2e:electron` (parallel in Electron), `npm run e2e:open`.
- Sharding is balanced by a spec timing table in `scripts/e2e-shards.mjs`; refresh it when specs are added or change a lot. CI (`.github/workflows/ci.yml`) uses the same script with 3 shards.
- Use `timeout` on long commands (e.g. `timeout 900 npm run e2e`) and leave no background processes running.
- Screenshots for visual review (run last, after a build): `npx start-server-and-test preview http://localhost:4173 'cypress run --browser firefox --expose SCREENSHOTS=1 --spec cypress/e2e/screenshots.cy.ts'`; images land in `cypress/screenshots/` (git-ignored).

## Model delegation workflow (mandatory)

This standing instruction from the user explicitly authorises spawning subagents via the Agent tool for every task in this repo. The main session (Opus) orchestrates; it does not write code or run test suites itself.

1. **Plan: Opus (main session).** Read the code and `SPEC.md`, work out the approach, and write a concrete plan: files to touch, behaviour, tests to add, commit boundaries.
2. **Code: Sonnet.** Hand the plan to a subagent with `model: "sonnet"` (e.g. `subagent_type: "general-purpose"`). Sonnet does all code edits (source, tests, Cypress specs) and commits per the rules below. Give it the full plan and the relevant rules from this file; it starts with no context.
3. **Review: Opus.** When Sonnet finishes, Opus reviews the diff (`git diff` / `git show`) against the plan, `SPEC.md` and the quality bar. Send fixes back to Sonnet (prefer `SendMessage` to the same agent so it keeps its context) rather than editing directly.
4. **Test: Haiku.** Run checks (typecheck, lint, Vitest, build, Cypress, screenshot spec) through a subagent with `model: "haiku"`. It runs the commands (with `timeout`), waits for them to finish, cleans up background processes, and reports back: pass/fail per command, failing test names, and the exact error output. It must not edit code or attempt fixes.
5. **Feedback loop: Opus.** Haiku's results come back to Opus, which diagnoses the failures and sends a fix plan to Sonnet (step 2), then review (3) and re-test (4) until green.
6. **UI review: Opus.** For user-facing/visual changes, have Haiku run the screenshot spec (command above) and report the image paths in `cypress/screenshots/`; Opus then opens the PNGs with the Read tool and reviews them visually (plus any Cypress failure screenshots). Visual issues go back to Sonnet as a fix plan.

Small exceptions: Opus may make trivial non-code edits (e.g. docs/notes like this file) directly.

## E2E browser choice

Measured on this machine, full suite (`cypress run`, after the build), two runs each: Electron 95 s and 95 s, Firefox 99 s and 99 s, all 86 tests green both ways, so speed is a wash. The difference is failure behaviour: with Electron, `cy.screenshot()` on a failed test hangs until its 30 s timeout (and again for the run-failure screenshot), so a failing run took about 175 s and the real error was buried. Firefox fails fast with a clean message. Hence `npm run e2e` defaults to Firefox. Electron defaults to the dark colour scheme and Firefox to light, so the axe specs set the theme explicitly (`setTheme`) and cover both.

## Commits

- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `chore: …`, `docs: …`, `refactor(scope): …`.
  Scopes: `engine`, `clues`, `solver`, `worker`, `ui`, `toolkit`, `game`, `persist`, `e2e`, `build`, `a11y`, `perf`, `ci`.
- Commit in small logical steps as you go (not one giant commit). Never commit failing tests or a broken build.
- A feature's tests (Vitest and Cypress) go in the same commit as the feature; don't split them into a separate `test(e2e)` commit. Use `test(...)` commits only for test-only changes.
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
