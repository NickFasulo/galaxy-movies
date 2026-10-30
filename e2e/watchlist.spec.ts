import { expect, test } from './fixtures'

test.describe('watchlist', () => {
  test('save, persist, and remove a title', async ({ page }) => {
    await page.goto('/movies/550')

    // DetailActions' labelled button and SimilarMovies' card icon buttons
    // share the same aria-label — the labelled one comes first in the DOM.
    await page.getByRole('button', { name: 'Save to My List' }).first().click()
    await expect(page.getByRole('button', { name: 'Saved to My List' }).first()).toBeVisible()

    await page.goto('/watchlist')
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()

    // localStorage-backed — survives a full reload.
    await page.reload()
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Saved to My List' }).first().click()
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
  })
})
