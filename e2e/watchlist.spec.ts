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

  test('marking watched moves the title off the list, undo restores it', async ({ page }) => {
    await page.goto('/movies/550')
    await page.getByRole('button', { name: 'Save to My List' }).first().click()
    await page.getByRole('button', { name: 'Mark as watched' }).first().click()
    await expect(page.getByRole('button', { name: 'Watched: click to undo' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save to My List' }).first()).toBeVisible()

    await page.goto('/watchlist')
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()

    // Undo on the detail page puts the watchlist slot back.
    await page.goto('/movies/550')
    await page.getByRole('button', { name: 'Watched: click to undo' }).first().click()
    await expect(page.getByRole('button', { name: 'Saved to My List' }).first()).toBeVisible()
    await page.goto('/watchlist')
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toHaveCount(0)
  })

  test('un-watching a title that was never saved does not create a list entry', async ({ page }) => {
    await page.goto('/movies/550')
    await page.getByRole('button', { name: 'Mark as watched' }).first().click()
    await page.getByRole('button', { name: 'Watched: click to undo' }).first().click()
    await page.goto('/watchlist')
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toHaveCount(0)
  })
})
