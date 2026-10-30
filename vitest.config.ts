import { defineConfig } from 'vitest/config'

// Coverage is scoped to the testable layer: non-component .ts modules in the
// feature/lib/api trees. Components (.tsx), og routes, middleware, and
// test/type files are out of scope — there's no component test stack, and
// src/lib/redis.ts is mocked everywhere so real coverage can't mean anything.
// `all: true` counts files no test ever loads, so 0%-coverage modules stop
// hiding behind the imported-files-only denominator.
export default defineConfig({
  test: {
    // Scoped so Playwright specs in e2e/ (also *.spec.ts) never get collected.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/features/**/*.ts', 'src/lib/**/*.ts', 'src/pages/api/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/types/**',
        'src/lib/redis.ts'
      ],
      reporter: ['text', 'json-summary'],
      // Aggregate floors sit ~3 points under the honest all-files baseline
      // (66/65/66/60) — a ratchet, tightened as coverage climbs. Per-glob
      // floors pin already-strong modules so they can't silently rot.
      thresholds: {
        lines: 63,
        statements: 61,
        functions: 63,
        branches: 56,
        'src/lib/rateLimiter.ts': { lines: 90, functions: 90, branches: 80 },
        'src/lib/format/formatters.ts': { lines: 95, functions: 95 },
        'src/features/catalog/streamingChanges.ts': { lines: 75, functions: 70, branches: 60 }
      }
    }
  }
})
