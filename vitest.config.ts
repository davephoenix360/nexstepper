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
      // `import 'server-only'` is a no-op in production Node.js but
      // throws in the test runtime. Alias to a no-op stub so modules
      // that mark themselves server-only can still be tested.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts')
    }
  }
});