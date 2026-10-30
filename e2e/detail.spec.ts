import { expect, test } from './fixtures'

test.describe('title detail', () => {
  test('movie detail renders core sections', async ({ page }) => {
    await page.goto('/movies/550')
    await expect(page.getByRole('heading', { name: 'Fight Club', exact: true })).toBeVisible()
    await expect(page.getByText(/Mischief\. Mayhem\. Soap\./)).toBeVisible()
  })

  test('rating a movie persists across reload', async ({ page }) => {
    await page.goto('/movies/550')
    await page.getByRole('button', { name: 'Rate this movie' }).click()
    await page.getByRole('button', { name: 'Rate 8 out of 10' }).click()
    await expect(page.getByRole('button', { name: 'Your rating: 8/10' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Your rating: 8/10' })).toBeVisible()
  })
})
