import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
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
      // The `server-only` package throws when imported outside a Server
      // Component context. In vitest's Node environment we alias it to
      // an empty stub so the import succeeds; runtime behavior is
      // unchanged (it has no exports).
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts')
    }
  }
});