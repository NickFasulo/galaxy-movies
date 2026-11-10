import { expect, test } from './fixtures'

test.describe('trailer watch page', () => {
  test('movie trailer page renders the player inline', async ({ page }) => {
    await page.goto('/movies/550/trailer')
    await expect(page.getByRole('heading', { name: /Fight Club — Official Trailer/ })).toBeVisible()
    // The iframe must exist in the rendered DOM on load — Google reports
    // "Cannot determine video position" for click-to-mount players.
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible()
  })

  test('tv trailer page renders the player inline', async ({ page }) => {
    await page.goto('/tv/1399/trailer')
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible()
  })

  test('detail page links to the trailer page', async ({ page }) => {
    await page.goto('/movies/550')
    await expect(page.getByRole('link', { name: 'Trailer page' })).toHaveAttribute('href', /\/movies\/550\/trailer/)
  })
})
