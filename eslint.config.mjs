import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * ## Why this exists
 *
 * The repo had no linter at all. The CI workflow ran `pnpm typecheck`
 * and `pnpm test` and nothing else, so the classes of mistake ESLint
 * catches — a hook called conditionally, an unescaped entity in JSX, an
 * effect without a dependency — reached `main` and were caught, if at
 * all, at deploy time.
 *
 * The deploy is the expensive place to catch them: `prebuild` runs
 * `pnpm db:migrate` before `next build`, so a build failure on `main` is
 * also a migration failure on the production database.
 *
 * ## The rule set
 *
 * `eslint-config-next` (core-web-vitals + typescript) — the rules that
 * are specific to THIS framework: React hooks, Next.js data fetching,
 * the `@next/next` image and link rules. These are the ones a generic
 * linter does not know about and the ones that have actually bitten
 * this codebase.
 *
 * ## Two rules are WARNINGS, not errors
 *
 * `react-hooks/set-state-in-effect` (27 sites) and `react-hooks/refs`
 * (15 sites) are the React Compiler's rules, new in
 * `eslint-config-next` 16. Both flag patterns that WORK today but that
 * the React Compiler will refuse to compile: a `setState` called
 * synchronously inside an effect, and a ref read during render.
 *
 * They are warnings because fixing them properly means restructuring
 * ~19 components — moving state updates out of effects and into event
 * handlers, and replacing render-time ref reads with state. That is a
 * React Compiler migration, not a lint fix, and doing it in the same
 * change as a scoring fix would risk the editor for no product gain.
 *
 * They are still VISIBLE: the lint step prints them, so the migration
 * backlog is greppable and the count can be watched as it comes down.
 * Everything else is an error, and an error fails CI.
 *
 * ## `lib/scoring/` is not special-cased
 *
 * Its purity invariant (sync, IO-free, deterministic) is enforced by a
 * dedicated test — `tests/unit/scoring/purity.test.ts` — which is a
 * stronger guarantee than a lint rule. The linter still runs over it.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler migration backlog — see the note above.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn'
    }
  },
  {
    // Test files deliberately do things production code must not: assign
    // to an outer variable from a render to capture what a hook returned,
    // `require()` a fixture lazily, and use `any` to smuggle a malformed
    // payload past a validator. Those are test idioms, not defects.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/globals': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  globalIgnores([
    // Build output + dependencies.
    '.next/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'next-env.d.ts',

    // Local scratch directories. `.trash` is this repo's recoverable
    // delete target and `output/` holds measurement-script artefacts
    // (a headless Chrome profile, page-break dumps). Neither is source.
    '.trash/**',
    'output/**',

    // Generated / vendored artefacts — not ours to lint.
    'lib/chat/page-fit.generated.ts',
    'lib/chat/section-space.generated.ts',
    'lib/db/migrations/**',

    // Vendored measurement scripts — plain Node, not part of the app.
    'scripts/**/*.cjs',
    'scripts/**/*.mjs'
  ])
]);
