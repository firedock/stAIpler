import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  outDir: 'dist',
  target: 'node18',
  external: ['vscode'],
  noExternal: ['@staipler/core'],
  sourcemap: true,
  clean: true,
});
