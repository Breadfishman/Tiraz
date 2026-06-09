import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI layer (entrypoint + commander wiring) is thin glue over fully-unit-tested
      // core logic — exercised by the built-bin smoke tests in `npm run check`, not here.
      // `playwright-io.ts` is raw process/browser I/O (real `spawn` + Playwright); it can only be
      // exercised with a live harness server + browser, so the testable decisions all live in
      // `playwright-renderer.ts` / `render-harness.ts` and this thin glue is excluded.
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts',
        'src/cli/**',
        'src/core/playwright-io.ts',
        'src/core/anthropic-io.ts',
        'src/core/claude-judge-io.ts',
        'src/core/ds-collect-io.ts',
      ],
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
