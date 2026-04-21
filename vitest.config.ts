import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@staipler/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/adapters/*/tests/**/*.test.ts',
    ],
  },
});
