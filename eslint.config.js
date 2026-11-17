import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'cypress/screenshots', 'cypress/videos'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // SPEC §7 / CLAUDE.md: the solution must never reach the main thread. UI and
    // state code may only use pure, solution-free engine modules (types, clue
    // checking/rendering, furniture/room catalogues, hashPlacement) and must talk
    // to the generator/solvers through src/worker/client.ts. Importing the barrel
    // `src/engine` (index.ts) is also banned since it re-exports the generator.
    files: ['src/ui/**/*.{ts,tsx}', 'src/state/**/*.{ts,tsx}', 'src/App.tsx', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)engine/generator$',
              message: 'Generator is worker-only. Use src/worker/client.ts.',
            },
            {
              regex: '(^|/)engine/solver(/|$)',
              message: 'Solvers are worker-only. Use src/worker/client.ts.',
            },
            {
              regex: '(^|/)engine/placement$',
              message: 'Solution placement is worker-only.',
            },
            {
              regex: '(^|/)engine/index$|(^|/)engine/?$',
              message: 'The engine barrel re-exports the generator. Import specific pure modules.',
            },
            {
              regex: '(^|/)engine/secure$',
              importNames: ['solutionHash', 'canonicalPlacement'],
              message: 'Only hashPlacement may be imported from engine/secure.',
            },
          ],
        },
      ],
    },
  },
);
