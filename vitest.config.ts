import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI layer (entrypoint + commander wiring) is thin glue over fully-unit-tested
      // core logic — exercised by the built-bin smoke tests in `npm run check`, not here.
      exclude: ['src/**/*.test.ts', 'src/cli.ts', 'src/cli/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      reporter: ['text', 'html'],
    },
  },
});
