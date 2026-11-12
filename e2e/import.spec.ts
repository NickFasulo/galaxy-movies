import { expect, test } from './fixtures'
import { stubAccountApi } from './helpers'

// Stored-method (uncompressed) ZIP — enough for the client's parser, and it
// keeps the fixture legible without a compression dependency.
function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint32(18, file.data.length, true)
    local.setUint32(22, file.data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, file.data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint32(20, file.data.length, true)
    central.setUint32(24, file.data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    centrals.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + file.data.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + 22)
  let pos = 0
  for (const part of [...parts, ...centrals, new Uint8Array(eocd.buffer)]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

const csv = (content: string) => new TextEncoder().encode(content)

const FOLLOWED_CSV = `user_id,tv_show_id,archived,tv_show_name
1,1399,0,Game of Thrones
1,953,1,Old Archived Show
`

const TRACKING_V1_CSV = `type,entity_type,uuid,movie_name,release_date,alpha_range_key,series_id,series_name,season_number,episode_number,episode_id,watch_date
watch,movie,uu-watch,Past Flick,2010-05-01,watch-alpha-past-flick,,,,,
towatch,movie,uu-later,Interstellar,2014-11-07,towatch-alpha-interstellar,,,,,
watch,episode,uu-ep,,,,60735,The Flash,1,1,123,2021-01-01
`

const RATINGS_CSV = `episode_id,movie_name,uuid,vote_key,user_id
0,Past Flick,uu-watch,uu-watch-36089951-29,36089951
`

const LETTERBOXD_CSV = `Date,Name,Year,Letterboxd URI
2024-01-01,Fight Club,1999,https://boxd.it/2a9q
`

test.describe('free imports (no account)', () => {
  test('import controls render without creds or plus', async ({ page }) => {
    await page.goto('/watchlist')
    await expect(page.getByText('Import your list')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Letterboxd, IMDb, or TV Time export' })).toBeVisible()
    // Trakt tools stay Plus-gated.
    await expect(page.getByRole('button', { name: 'Import from Trakt' })).toHaveCount(0)
  })

  test('letterboxd csv import works without an account', async ({ page }) => {
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'fight club': { id: 550, mediaType: 'movie', title: 'Fight Club', year: '1999', poster_path: null }
    }
    await page.goto('/watchlist')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'watchlist.csv', mimeType: 'text/csv', buffer: Buffer.from(LETTERBOXD_CSV) }
    ])
    await expect(page.getByText('Imported 1 watchlist + 0 ratings + 0 watched.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()
  })

  test('tv time extracted csvs import shows, movies, ratings and history', async ({ page }) => {
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'game of thrones': { id: 1399, mediaType: 'tv', title: 'Game of Thrones', year: '2011', poster_path: null },
      'interstellar': { id: 157336, mediaType: 'movie', title: 'Interstellar', year: '2014', poster_path: null },
      'past flick': { id: 42, mediaType: 'movie', title: 'Past Flick', year: '2010', poster_path: null },
      'the flash': { id: 60735, mediaType: 'tv', title: 'The Flash', year: '2014', poster_path: null }
    }
    await page.goto('/watchlist')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'followed_tv_show.csv', mimeType: 'text/csv', buffer: Buffer.from(FOLLOWED_CSV) },
      { name: 'tracking-prod-records.csv', mimeType: 'text/csv', buffer: Buffer.from(TRACKING_V1_CSV) },
      { name: 'ratings-live-votes.csv', mimeType: 'text/csv', buffer: Buffer.from(RATINGS_CSV) }
    ])
    // vote_key suffix 29 → 8/10. The Past Flick watch row and the Flash
    // episode roll up into the Watched section.
    await expect(page.getByText('Imported 2 watchlist + 1 ratings + 2 watched.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Game of Thrones', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Interstellar', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toBeVisible()
    // Past Flick sits in both Your ratings and Watched — one card each.
    await expect(page.getByRole('link', { name: 'Past Flick', exact: true })).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'The Flash', exact: true })).toBeVisible()
    await expect(page.getByText('★ 8/10')).toBeVisible()
  })

  test('tv time zip import reads the archive locally', async ({ page }) => {
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'game of thrones': { id: 1399, mediaType: 'tv', title: 'Game of Thrones', year: '2011', poster_path: null },
      'interstellar': { id: 157336, mediaType: 'movie', title: 'Interstellar', year: '2014', poster_path: null },
      'past flick': { id: 42, mediaType: 'movie', title: 'Past Flick', year: '2010', poster_path: null },
      'the flash': { id: 60735, mediaType: 'tv', title: 'The Flash', year: '2014', poster_path: null }
    }
    const zip = buildZip([
      { name: 'followed_tv_show.csv', data: csv(FOLLOWED_CSV) },
      { name: 'tracking-prod-records.csv', data: csv(TRACKING_V1_CSV) },
      { name: 'ratings-live-votes.csv', data: csv(RATINGS_CSV) },
      { name: 'emotions-live-votes.csv', data: csv(RATINGS_CSV) },
      { name: 'user.csv', data: csv('id,email\n1,x@y.z') }
    ])
    await page.goto('/watchlist')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'tv-time-export.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }
    ])
    await expect(page.getByText(/Imported 2 watchlist \+ 1 ratings \+ 2 watched.*2 files ignored/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Game of Thrones', exact: true })).toBeVisible()
  })

  test('imdb exports import watchlist, ratings and check-ins', async ({ page }) => {
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'the matrix': { id: 603, mediaType: 'movie', title: 'The Matrix', year: '1999', poster_path: null },
      'breaking bad': { id: 1396, mediaType: 'tv', title: 'Breaking Bad', year: '2008', poster_path: null },
      'the shawshank redemption': { id: 278, mediaType: 'movie', title: 'The Shawshank Redemption', year: '1994', poster_path: null }
    }
    const watchlist = `Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0133093,2024-01-05,2024-01-05,,The Matrix,https://imdb.com/title/tt0133093/,movie,8.7,136,1999,"Action, Sci-Fi",2000000,1999-03-31,Wachowskis
`
    const ratings = `Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0903747,9,2023-04-12,Breaking Bad,https://imdb.com/title/tt0903747/,TV Series,9.5,49,2008,"Crime, Drama",1900000,2008-01-20,
`
    const checkins = `Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0111161,2024-02-10,2024-02-10,,The Shawshank Redemption,https://imdb.com/title/tt0111161/,movie,9.3,142,1994,Drama,2800000,1994-09-10,Frank Darabont
`
    await page.goto('/watchlist')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'watchlist.csv', mimeType: 'text/csv', buffer: Buffer.from(watchlist) },
      { name: 'ratings.csv', mimeType: 'text/csv', buffer: Buffer.from(ratings) },
      { name: 'checkins.csv', mimeType: 'text/csv', buffer: Buffer.from(checkins) }
    ])
    await expect(page.getByText('Imported 1 watchlist + 1 ratings + 1 watched.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'The Matrix', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Breaking Bad', exact: true })).toBeVisible()
    await expect(page.getByText('★ 9/10')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'The Shawshank Redemption', exact: true })).toBeVisible()
  })

  test('letterboxd diary imports to watched, not the watchlist', async ({ page }) => {
    const account = await stubAccountApi(page)
    account.resolvedTitles = {
      'fight club': { id: 550, mediaType: 'movie', title: 'Fight Club', year: '1999', poster_path: null }
    }
    await page.goto('/watchlist')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'diary.csv', mimeType: 'text/csv', buffer: Buffer.from(`Watched Date,Name,Year,Letterboxd URI,Rating
2024-03-01,Fight Club,1999,https://boxd.it/2a9q,4.5
`) }
    ])
    await expect(page.getByText('Imported 0 watchlist + 0 ratings + 1 watched.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fight Club', exact: true })).toBeVisible()
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
  })
})

test.describe('tv time alternative page', () => {
  test('renders the comparison and the import widget', async ({ page }) => {
    await page.goto('/tv-time-alternative')
    await expect(page.getByRole('heading', { name: 'TV Time Alternative: Import Your List, No Account Needed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pick your TV Time export' })).toBeVisible()
    await expect(page.getByText('Galaxy Movies vs TV Time')).toBeVisible()
  })
})

test.describe('imdb alternative page', () => {
  test('renders the comparison and the import widget', async ({ page }) => {
    await page.goto('/imdb-alternative')
    await expect(page.getByRole('heading', { name: 'A No-Account IMDb Alternative for Watchlists and Alerts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pick your IMDb export' })).toBeVisible()
    await expect(page.getByText('Galaxy Movies vs IMDb')).toBeVisible()
  })
})
