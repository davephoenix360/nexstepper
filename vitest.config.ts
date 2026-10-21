import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Default stays `node`. Interaction tests live in
    // `tests/interaction/**` and opt into jsdom per-file with a
    // `@vitest-environment jsdom` docblock.
    //
    // Why per-file and not a global flip: 120+ existing suites render
    // templates through `renderToStaticMarkup`, which needs no DOM and
    // is meaningfully faster under `node`. Flipping the default
    // environment would slow every one of them and could change
    // behaviour in suites that only accidentally work today (e.g. the
    // `server-only` alias stub). Keeping DOM tests in their own
    // directory also makes the reason for the extra dependency
    // obvious to the next person who opens the folder.
    environment: 'node',
    globals: true,
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/interaction/**/*.{test,spec}.{ts,tsx}'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'components/schema-form/**/*.{ts,tsx}',
        'lib/**/*.ts'
      ],
      exclude: ['**/*.test.*', '**/types.ts', '**/index.ts']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // `import 'server-only'` is a no-op in production Node.js but
      // throws in the test runtime. Alias to a no-op stub so modules
      // that mark themselves server-only can still be tested.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts')
    }
  }
});