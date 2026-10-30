import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL targets an already-running server (wrangler dev in e2e.yml, a
// deployed workers.dev host, or a manual `npm start`). Otherwise Playwright
// boots `next dev` on a dedicated port with the spend-capable env vars
// scrubbed: .env.local loads TMDB_API_KEY but Next never overrides vars that
// are already set, so the empties below win — local runs can't touch
// Redis/OpenAI/Resend/Watchmode even though .env.local carries them. (Detail
// pages only generate AI content when a referer is present, and client-side
// navigations always send one, so a scrub-free reused server could spend.)
const PORT = '3100'
// localhost (not 127.0.0.1) keeps the HMR socket same-origin — Next dev blocks
// cross-origin requests to /_next/* by default.
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Dev-mode route compiles + live TMDB SSR make first hits slow — a fresh
  // suite run can spend ~30s just compiling the route it's about to visit.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev --webpack -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          OPENAI_API_KEY: '',
          UPSTASH_REDIS_KV_REST_API_URL: '',
          UPSTASH_REDIS_KV_REST_API_TOKEN: '',
          UPSTASH_REDIS_KV_REST_API_READ_ONLY_TOKEN: '',
          UPSTASH_REDIS_KV_URL: '',
          UPSTASH_REDIS_REDIS_URL: '',
          RESEND_API_KEY: '',
          WATCHMODE_API_KEY: '',
          NEXT_PUBLIC_UMAMI_SRC: '',
          NEXT_PUBLIC_UMAMI_WEBSITE_ID: ''
        }
      }
})
