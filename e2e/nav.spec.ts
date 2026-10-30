import { expect, test } from './fixtures'

test.describe('navigation', () => {
  test('explore menu routes to the tv hub', async ({ page }) => {
    await page.goto('/search') // non-home page gets the full header chrome
    // First-hit hydration can still be in flight when the trigger becomes
    // clickable — retry the click until the menu actually opens.
    await expect(async () => {
      await page.getByRole('button', { name: 'Explore' }).click()
      await expect(page.getByRole('menuitem', { name: 'TV Shows' })).toBeVisible({ timeout: 3000 })
    }).toPass()
    await page.getByRole('menuitem', { name: 'TV Shows' }).click()
    await page.waitForURL('**/tv')
    await expect(page.locator('a[href^="/tv/"]').first()).toBeVisible()
  })

  test('provider page renders its catalog', async ({ page }) => {
    await page.goto('/streaming/netflix')
    await expect(page.getByRole('heading', { name: 'Best Movies on Netflix' })).toBeVisible()
    await expect(page.locator('a[href^="/movies/"]').first()).toBeVisible()
  })

  test('invalid title id renders the 404 page', async ({ page }) => {
    const resp = await page.goto('/movies/abc')
    expect(resp?.status()).toBe(404)
    // workerd serves Next's built-in 404 ("could not be found") for dynamic
    // notFound rather than the custom 404.tsx ("Page Not Found") — assert the
    // invariant, not the brand copy.
    await expect(page.getByText(/could not be found|page not found/i).first()).toBeVisible()
  })
})
