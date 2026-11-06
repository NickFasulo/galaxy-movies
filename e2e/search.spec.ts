import { expect, test } from './fixtures'

test.describe('search', () => {
  test('typing syncs ?q= and renders results', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByLabel('Search movies and shows')
    await input.fill('fight club')
    await expect(page).toHaveURL(/[?&]q=fight(%20|\+)club/)
    // Stable id: Fight Club is TMDB movie 550.
    await expect(page.locator('a[href="/movies/550"]')).toBeVisible()
    await page.locator('a[href="/movies/550"]').click()
    await page.waitForURL('**/movies/550')
    await expect(page.getByRole('heading', { name: 'Fight Club', exact: true })).toBeVisible()
  })

  test('a page drag blurs the input; in-field drags keep focus', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByLabel('Search movies and shows')
    await input.fill('fight club')
    await expect(input).toBeFocused()
    // Drags that begin inside the field are caret/text gestures — focus stays.
    await input.dispatchEvent('touchmove')
    await expect(input).toBeFocused()
    // A drag anywhere else is a page scroll and dismisses the keyboard — iOS
    // can't scroll reliably while a valued text field stays focused.
    await page.dispatchEvent('body', 'touchmove')
    await expect(input).not.toBeFocused()
  })

  test('no-match query shows the empty state', async ({ page }) => {
    await page.goto('/search')
    await page.getByLabel('Search movies and shows').fill('zxqwvbnm')
    await expect(page.getByText(/No results for/)).toBeVisible()
  })
})
