import { defineConfig } from 'vitest/config'

// Floors sit ~3 points under the current baseline (72/69/67/63) — a ratchet,
// not a gate: tighten them when coverage climbs rather than failing on drift.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 70,
        statements: 67,
        functions: 65,
        branches: 60
      }
    }
  }
})
