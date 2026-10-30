import { expect, test } from './fixtures'
import { E2E_EMAIL, E2E_KEY, seedAlertsCreds, stubAccountApi } from './helpers'

test.describe('plus signup', () => {
  test('login form issues sync creds and shows the plan picker', async ({ page }) => {
    await stubAccountApi(page, { entitlement: 'free' })
    await page.goto('/plus')

    await page.getByPlaceholder('you@example.com').fill(E2E_EMAIL)
    await page.getByRole('button', { name: 'Send my link' }).click()

    // The devSyncKey fallback runs the same setAlertsCredentials path a
    // confirm link does — creds land in localStorage and the page swaps the
    // login form for the plan picker.
    await expect(page.getByRole('heading', { name: 'Pick a plan' })).toBeVisible()
    const stored = await page.evaluate(() => window.localStorage.getItem('gm.alerts.v1'))
    expect(stored).toContain(E2E_EMAIL)
    await page.getByRole('button', { name: 'Go monthly' }).click()
    // Stubbed checkout hands back a URL — the real one would be Polar's.
    await page.waitForURL('**/plus?status=success')
    await expect(page.getByText(/Plus activates as soon as the payment clears/)).toBeVisible()
  })

  test('active plus shows the subscriber card', async ({ page }) => {
    await seedAlertsCreds(page)
    await stubAccountApi(page)
    await page.goto('/plus')
    await expect(page.getByText('Galaxy Plus is active')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage your subscription' })).toHaveAttribute(
      'href',
      `/api/billing/portal?email=${encodeURIComponent(E2E_EMAIL)}&key=${encodeURIComponent(E2E_KEY)}`
    )
  })

  test('free entitlement shows upsell, not tools', async ({ page }) => {
    await seedAlertsCreds(page)
    await stubAccountApi(page, { entitlement: 'free' })
    await page.goto('/watchlist')
    await expect(page.getByText('Galaxy Plus', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import from Trakt' })).toHaveCount(0)
  })
})

test.describe('plus tools — trakt', () => {
  test('import pulls trakt titles into the list', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)
    // The server merges Trakt items into stored prefs before the client
    // re-fetches — prefs already carry the imported title at GET time.
    account.prefs.watchlist = [
      { id: 238, mediaType: 'movie', title: 'The Godfather', poster_path: null, year: '1972' }
    ]
    account.traktImport = { status: 200, body: { ok: true, imported: { watchlist: 1, ratings: 0 } } }

    await page.goto('/watchlist')
    await expect(page.getByText('Galaxy Plus is active')).toBeVisible()
    await page.getByRole('button', { name: 'Import from Trakt' }).click()
    await expect(page.getByText('Imported 1 watchlist + 0 ratings from Trakt.')).toBeVisible()
    // mergeSyncedPrefs wrote localStorage → the card renders without a reload.
    await expect(page.getByRole('link', { name: 'The Godfather', exact: true })).toBeVisible()
  })

  test('sync reports pushed counts', async ({ page }) => {
    await seedAlertsCreds(page)
    await stubAccountApi(page)
    await page.goto('/watchlist')
    await page.getByRole('button', { name: 'Sync now' }).click()
    await expect(page.getByText('Synced 2 watchlist + 1 ratings to Trakt.')).toBeVisible()
  })

  test('disconnect flips the row back to connect', async ({ page }) => {
    await seedAlertsCreds(page)
    await stubAccountApi(page)
    await page.goto('/watchlist')
    await page.getByRole('button', { name: 'Disconnect' }).click()
    await expect(page.getByRole('link', { name: 'Connect Trakt' })).toBeVisible()
  })

  test('not_connected import refreshes to the connect state', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)
    account.traktImport = { status: 409, body: { error: 'Trakt is not connected. Please reconnect.', code: 'not_connected' } }
    await page.goto('/watchlist')
    await page.getByRole('button', { name: 'Import from Trakt' }).click()
    await expect(page.getByRole('link', { name: 'Connect Trakt' })).toHaveAttribute(
      'href',
      `/api/trakt/connect?email=${encodeURIComponent(E2E_EMAIL)}&key=${encodeURIComponent(E2E_KEY)}`
    )
  })

  test('callback render states', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)

    await page.goto('/watchlist?trakt=connected')
    await expect(page.getByText('Trakt connected: hit Sync now to push your list.')).toBeVisible()

    account.traktConnected = false
    await page.goto('/watchlist?trakt=error')
    await expect(page.getByText('Connection failed: try again.')).toBeVisible()
  })
})

test.describe('plus tools — import/export', () => {
  const WATCHLIST_CSV = [
    'Date,Name,Year,Letterboxd URI',
    '2024-01-01,Fight Club,1999,https://boxd.it/2a9q',
    '2024-01-02,The Godfather,1972,https://boxd.it/2a70'
  ].join('\n')
  const RATINGS_CSV = [
    'Date,Name,Year,Letterboxd URI,Rating',
    '2024-01-03,Pulp Fiction,1994,https://boxd.it/29Pq,4.5'
  ].join('\n')

  test('letterboxd csv import merges resolved titles', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'fight club': { id: 550, mediaType: 'movie', title: 'Fight Club', year: '1999', poster_path: null },
      'the godfather': { id: 238, mediaType: 'movie', title: 'The Godfather', year: '1972', poster_path: null },
      'pulp fiction': { id: 680, mediaType: 'movie', title: 'Pulp Fiction', year: '1994', poster_path: null }
    }
    await page.goto('/watchlist')

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'watchlist.csv', mimeType: 'text/csv', buffer: Buffer.from(WATCHLIST_CSV) },
      { name: 'ratings.csv', mimeType: 'text/csv', buffer: Buffer.from(RATINGS_CSV) }
    ])
    await expect(page.getByText('Imported 2 watchlist + 1 ratings.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'The Godfather', exact: true })).toBeVisible()
    // 4.5 stars → 9/10 badge on the ratings section card.
    await expect(page.getByText('★ 9/10')).toBeVisible()
  })

  test('json and letterboxd exports download', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)
    account.prefs.watchlist = [{ id: 550, mediaType: 'movie', title: 'Fight Club' }]
    account.prefs.ratings = [{ id: 550, mediaType: 'movie', title: 'Fight Club', rating: 9 }]
    await page.goto('/watchlist')

    const [jsonDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON' }).click()
    ])
    expect(jsonDl.suggestedFilename()).toBe('galaxy-movies-data.json')

    const [watchlistDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Letterboxd watchlist CSV' }).click()
    ])
    expect(watchlistDl.suggestedFilename()).toBe('galaxy-watchlist-letterboxd.csv')

    const [ratingsDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Letterboxd ratings CSV' }).click()
    ])
    expect(ratingsDl.suggestedFilename()).toBe('galaxy-ratings-letterboxd.csv')
  })

  test('share link create and disable', async ({ page }) => {
    await seedAlertsCreds(page)
    await stubAccountApi(page)
    await page.goto('/watchlist')
    await page.getByRole('button', { name: 'Create a public link' }).click()
    await expect(page.getByText('Share link copied.')).toBeVisible()
    // readOnly inputs: the calendar feed field renders before the share field.
    await expect(page.locator('input[readonly]').last()).toHaveValue(/\/list\/e2eshare/)

    await page.getByRole('button', { name: 'Disable' }).click()
    await expect(page.getByRole('button', { name: 'Create a public link' })).toBeVisible()
  })

  test('picked for you rail renders for plus users', async ({ page }) => {
    await seedAlertsCreds(page)
    const account = await stubAccountApi(page)
    account.recs = [{ id: 1399, mediaType: 'tv' }]
    account.posters['tv:1399'] = { title: 'Game of Thrones', poster_path: '/got.jpg' }
    await page.goto('/watchlist')
    await expect(page.getByRole('heading', { name: 'Picked for you' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Game of Thrones' })).toHaveAttribute('href', '/tv/1399')
  })
})
