import { expect, test } from './fixtures'

test.describe('home', () => {
  test('renders hero and content rails', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Trending this week' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /New on / })).toBeVisible()
    await expect(page.locator('a[href^="/movies/"], a[href^="/tv/"]').first()).toBeVisible()
  })

  test('trending card navigates to its detail page', async ({ page }) => {
    await page.goto('/')
    const rail = page.locator('section', { has: page.getByRole('heading', { name: 'Trending this week' }) })
    const card = rail.locator('a[href^="/movies/"], a[href^="/tv/"]').first()
    await card.click()
    await page.waitForURL(/\/(movies|tv)\/\d+/)
    // Detail pages title at h2 — assert the action widget every detail page has.
    await expect(page.getByRole('button', { name: /rate this (movie|show)/i })).toBeVisible()
  })
})
