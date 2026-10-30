import { expect, test as base } from '@playwright/test'

// Uncaught page errors (hydration crashes, runtime exceptions) fail the test.
// The assertion lives in fixture teardown so it fires even when the test body
// only asserts server-rendered content.
export const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err?.message || err)))
    await run(page)
    expect(errors, 'uncaught page errors').toEqual([])
  }
})

export { expect }
