import { getRedis } from '../../lib/redis'
import { searchMovieByTitle, searchTvByTitle } from './tmdb'

// Demand-side streams: platform viewership (Netflix top 10), watch activity
// (Trakt), and purchase intent (Apple charts). Kept as separate buckets — each
// measures a different behavior, collapsing them would be misleading.
const CHART_TTL_SECONDS = 60 * 60 * 24 * 400
const LATEST_KEY = 'charts:latest'
const TRAKT_LIMIT = 25
const APPLE_LIMIT = 25
const NETFLIX_COUNTRIES = ['US', 'IN']
// Title→TMDB lookups are cached in charts:resolve:*, so the budget only covers
// genuinely new chart entries each week.
const RESOLVE_BUDGET = 60

export interface ChartRow {
  r: number
  t: string
  id?: number
  y?: number
  n?: number
  w?: number
  v?: number
  h?: number
  sid?: string
}

const traktKey = (date: string) => `charts:trakt:${date}`
const appleKey = (date: string) => `charts:apple:${date}`
const netflixKey = (week: string) => `charts:netflix:${week}`
const resolveKey = (media: 'movie' | 'tv') => `charts:resolve:${media}`

const normTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim()

let resolveBudget = RESOLVE_BUDGET

async function resolveTmdb(
  kv: NonNullable<ReturnType<typeof getRedis>>,
  media: 'movie' | 'tv',
  title: string
): Promise<number | undefined> {
  const norm = normTitle(title)
  if (!norm) return undefined
  try {
    const cached = await kv.hget<string | number>(resolveKey(media), norm).catch(() => null)
    if (cached !== null && cached !== undefined) {
      const id = Number(cached)
      return id > 0 ? id : undefined
    }
    if (resolveBudget <= 0) return undefined
    resolveBudget--
    const hit = media === 'movie' ? await searchMovieByTitle(title) : await searchTvByTitle(title)
    const hitTitle = (hit as { title?: string; name?: string } | null)?.title || (hit as { name?: string } | null)?.name || ''
    const id = hit && normTitle(hitTitle) === norm ? hit.id : 0
    await kv.hset(resolveKey(media), { [norm]: id })
    return id > 0 ? (id as number) : undefined
  } catch {
    return undefined
  }
}

interface TraktItem {
  watchers?: number
  watcher_count?: number
  play_count?: number
  list_count?: number
  revenue?: number
  movie?: { title?: string; year?: number; ids?: { tmdb?: number } }
  show?: { title?: string; year?: number; ids?: { tmdb?: number } }
}

async function traktFetch(path: string): Promise<TraktItem[]> {
  const clientId = process.env.TRAKT_CLIENT_ID
  if (!clientId) return []
  try {
    const res = await fetch(`https://api.trakt.tv${path}`, {
      headers: {
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'User-Agent': 'galaxymovies.app'
      }
    })
    if (!res.ok) return []
    return (await res.json()) as TraktItem[]
  } catch {
    return []
  }
}

function traktRows(items: TraktItem[], media: 'movie' | 'tv', metric: (i: TraktItem) => number | undefined): ChartRow[] {
  const rows: ChartRow[] = []
  items.slice(0, TRAKT_LIMIT).forEach((item, i) => {
    const entry = media === 'movie' ? item.movie : item.show
    if (!entry?.title) return
    const row: ChartRow = { r: i + 1, t: entry.title }
    if (entry.ids?.tmdb) row.id = entry.ids.tmdb
    if (entry.year) row.y = entry.year
    const n = metric(item)
    if (typeof n === 'number') row.n = n
    rows.push(row)
  })
  return rows
}

async function updateTrakt(kv: NonNullable<ReturnType<typeof getRedis>>, today: string): Promise<number> {
  const metrics: [string, 'movie' | 'tv', string, (i: TraktItem) => number | undefined][] = [
    ['trending', 'movie', `/movies/trending?limit=${TRAKT_LIMIT}`, (i) => i.watchers],
    ['weekly', 'movie', `/movies/watched/weekly?limit=${TRAKT_LIMIT}`, (i) => i.play_count ?? i.watcher_count],
    ['anticipated', 'movie', `/movies/anticipated?limit=${TRAKT_LIMIT}`, (i) => i.list_count],
    ['boxoffice', 'movie', `/movies/boxoffice`, (i) => i.revenue],
    ['trending', 'tv', `/shows/trending?limit=${TRAKT_LIMIT}`, (i) => i.watchers],
    ['weekly', 'tv', `/shows/watched/weekly?limit=${TRAKT_LIMIT}`, (i) => i.play_count ?? i.watcher_count],
    ['anticipated', 'tv', `/shows/anticipated?limit=${TRAKT_LIMIT}`, (i) => i.list_count]
  ]
  const results = await Promise.all(metrics.map(([, , path]) => traktFetch(path)))
  const fields: Record<string, ChartRow[]> = {}
  metrics.forEach(([metric, media], i) => {
    const rows = traktRows(results[i] || [], media, metrics[i][3])
    if (rows.length) fields[`${metric}:${media}`] = rows
  })
  const count = Object.keys(fields).length
  if (!count) return 0
  await kv.hset(traktKey(today), fields as Record<string, unknown>)
  await kv.expire(traktKey(today), CHART_TTL_SECONDS)
  await kv.hset(LATEST_KEY, { trakt: traktKey(today) })
  return count
}

interface AppleEntry {
  'im:name'?: { label?: string }
  'im:releaseDate'?: { label?: string }
  id?: { attributes?: { 'im:id'?: string } }
  link?: { attributes?: { href?: string } }
}

const APPLE_CHARTS: [string, 'movie' | 'tv'][] = [
  ['topmovies', 'movie'],
  ['toptvseasons', 'tv']
]

// Apple's store CDN 403s the default workerd UA — send a browser one.
const FETCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function updateApple(kv: NonNullable<ReturnType<typeof getRedis>>, today: string): Promise<{ count: number; statuses: Record<string, number> }> {
  const fields: Record<string, ChartRow[]> = {}
  const statuses: Record<string, number> = {}
  for (const cc of ['us', 'in']) {
    for (const [chart, media] of APPLE_CHARTS) {
      const bucket = `${cc}:${chart === 'topmovies' ? 'movies' : 'tv'}`
      try {
        const res = await fetch(`https://itunes.apple.com/${cc}/rss/${chart}/limit=${APPLE_LIMIT}/json`, {
          headers: { 'User-Agent': FETCH_UA, Accept: 'application/json' }
        })
        statuses[bucket] = res.status
        if (!res.ok) continue
        const data = (await res.json()) as { feed?: { entry?: AppleEntry[] | AppleEntry } }
        const entries = Array.isArray(data?.feed?.entry) ? data.feed.entry : data?.feed?.entry ? [data.feed.entry] : []
        const rows: ChartRow[] = []
        for (let i = 0; i < entries.length && i < APPLE_LIMIT; i++) {
          const t = entries[i]?.['im:name']?.label
          if (!t) continue
          const row: ChartRow = { r: i + 1, t }
          const sid = entries[i]?.id?.attributes?.['im:id']
          if (sid) row.sid = sid
          const id = await resolveTmdb(kv, media, t)
          if (id) row.id = id
          rows.push(row)
        }
        if (rows.length) fields[bucket] = rows
      } catch {
        statuses[bucket] = 0
      }
    }
  }
  const count = Object.keys(fields).length
  if (!count) return { count: 0, statuses }
  await kv.hset(appleKey(today), fields as Record<string, unknown>)
  await kv.expire(appleKey(today), CHART_TTL_SECONDS)
  await kv.hset(LATEST_KEY, { apple: appleKey(today) })
  return { count, statuses }
}

// Netflix publishes the full weekly history as TSV — no build-id scraping
// needed, and country rows carry views/hours on recent weeks.
const NETFLIX_COUNTRIES_TSV = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv'
const NETFLIX_GLOBAL_TSV = 'https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv'

interface TsvRow {
  [col: string]: string
}

function parseTsv(tsv: string): TsvRow[] {
  const lines = tsv.split('\n')
  const header = lines[0]?.split('\t').map((h) => h.trim()) || []
  const rows: TsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const cols = line.split('\t')
    const row: TsvRow = {}
    header.forEach((h, j) => (row[h] = (cols[j] || '').trim()))
    rows.push(row)
  }
  return rows
}

const catSlug = (category: string) => {
  const c = category.toLowerCase()
  const media = c.startsWith('films') ? 'films' : 'tv'
  const lang = c.includes('non-english') ? 'non' : 'en'
  return { media: media === 'films' ? ('movie' as const) : ('tv' as const), slug: `${media}-${lang}` }
}

async function updateNetflix(kv: NonNullable<ReturnType<typeof getRedis>>): Promise<{ count: number; week: string }> {
  const [countriesRes, globalRes] = await Promise.all([fetch(NETFLIX_COUNTRIES_TSV), fetch(NETFLIX_GLOBAL_TSV)])
  const fields: Record<string, ChartRow[]> = {}

  let countriesRows: TsvRow[] = []
  let globalRows: TsvRow[] = []
  try {
    if (countriesRes.ok) countriesRows = parseTsv(await countriesRes.text())
  } catch {
    /* keep global */
  }
  try {
    if (globalRes.ok) globalRows = parseTsv(await globalRes.text())
  } catch {
    /* keep countries */
  }

  const maxWeek = [...countriesRows, ...globalRows].reduce((m, r) => (r.week > m ? r.week : m), '')
  if (!maxWeek) return { count: 0, week: '' }

  const mediaFor: Record<string, 'movie' | 'tv'> = {}
  const want: [TsvRow, string][] = []
  for (const row of countriesRows) {
    if (row.week !== maxWeek) continue
    const cc = (row.country_iso2 || '').toUpperCase()
    if (!NETFLIX_COUNTRIES.includes(cc)) continue
    const { media, slug } = catSlug(row.category || '')
    mediaFor[`${cc}:${slug}`] = media
    want.push([row, `${cc}:${slug}`])
  }
  for (const row of globalRows) {
    if (row.week !== maxWeek) continue
    const { media, slug } = catSlug(row.category || '')
    mediaFor[`global:${slug}`] = media
    want.push([row, `global:${slug}`])
  }

  for (const [row, bucket] of want) {
    const title = row.show_title || ''
    if (!title) continue
    const chartRow: ChartRow = { r: Number(row.weekly_rank) || 0, t: title }
    const w = Number(row.cumulative_weeks_in_top_10)
    if (w) chartRow.w = w
    const v = Number(row.weekly_views)
    if (v) chartRow.v = v
    const h = Number(row.weekly_hours_viewed)
    if (h) chartRow.h = h
    const id = await resolveTmdb(kv, mediaFor[bucket] || 'movie', title)
    if (id) chartRow.id = id
    ;(fields[bucket] ||= []).push(chartRow)
  }

  const count = Object.keys(fields).length
  if (!count) return { count: 0, week: maxWeek }
  for (const rows of Object.values(fields)) rows.sort((a, b) => a.r - b.r)
  await kv.hset(netflixKey(maxWeek), fields as Record<string, unknown>)
  await kv.expire(netflixKey(maxWeek), CHART_TTL_SECONDS)
  await kv.hset(LATEST_KEY, { netflix: netflixKey(maxWeek) })
  return { count, week: maxWeek }
}

export interface ChartsSummary {
  trakt: number
  apple: number
  netflix: number
  netflixWeek?: string
  appleStatus?: Record<string, number>
  skipped?: string
}

export async function updateCharts(): Promise<ChartsSummary> {
  const kv = getRedis()
  if (!kv) return { trakt: 0, apple: 0, netflix: 0, skipped: 'no redis' }
  resolveBudget = RESOLVE_BUDGET
  const today = new Date().toISOString().slice(0, 10)
  const [trakt, apple, netflix] = await Promise.all([
    updateTrakt(kv, today).catch((e) => {
      console.error('trakt charts failed:', e)
      return 0
    }),
    updateApple(kv, today).catch((e) => {
      console.error('apple charts failed:', e)
      return { count: 0, statuses: {} }
    }),
    updateNetflix(kv).catch((e) => {
      console.error('netflix charts failed:', e)
      return { count: 0, week: '' }
    })
  ])
  return {
    trakt,
    apple: apple.count,
    appleStatus: apple.statuses,
    netflix: netflix.count,
    netflixWeek: netflix.week || undefined
  }
}

export interface ChartsFeed {
  generated: number
  trakt?: { date: string; buckets: Record<string, ChartRow[]> }
  apple?: { date: string; buckets: Record<string, ChartRow[]> }
  netflix?: { week: string; buckets: Record<string, ChartRow[]> }
}

export async function getLatestCharts(): Promise<ChartsFeed | null> {
  const kv = getRedis()
  if (!kv) return null
  const latest = await kv.hgetall<Record<string, string>>(LATEST_KEY).catch(() => null)
  if (!latest) return null
  const keys = [latest.trakt, latest.apple, latest.netflix].filter(Boolean)
  const hashes = await Promise.all(keys.map((k) => kv.hgetall<Record<string, ChartRow[] | string>>(k).catch(() => null)))

  const parse = (hash: Record<string, ChartRow[] | string> | null): Record<string, ChartRow[]> => {
    const out: Record<string, ChartRow[]> = {}
    if (!hash) return out
    for (const [field, raw] of Object.entries(hash)) {
      const rows = typeof raw === 'string' ? (JSON.parse(raw) as ChartRow[]) : raw
      if (Array.isArray(rows)) out[field] = rows
    }
    return out
  }

  const feed: ChartsFeed = { generated: Date.now() }
  let i = 0
  if (latest.trakt) feed.trakt = { date: (keys[i] || '').replace('charts:trakt:', ''), buckets: parse(hashes[i++]) }
  if (latest.apple) feed.apple = { date: (keys[i] || '').replace('charts:apple:', ''), buckets: parse(hashes[i++]) }
  if (latest.netflix) feed.netflix = { week: (keys[i] || '').replace('charts:netflix:', ''), buckets: parse(hashes[i++]) }
  return feed
}
