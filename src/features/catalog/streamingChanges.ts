import { LRUCache } from 'lru-cache'
import { getRedis } from '../../lib/redis'
import { fetchDiscoverMovies, fetchDiscoverTv, fetchTmdb, getProviderIds, isProviderAvailableInRegion, streamingProviders, PROVIDER_NAME_MATCH } from './tmdb'
import { pingIndexNow } from '../../lib/indexnow'
import { SITE_URL } from '../../lib/site'
import type { MediaType, TitleSummary, TmdbMovie, TmdbPaged, TmdbTvShow } from '../../types/tmdb'

const WATCHMODE_BASE = 'https://api.watchmode.com/v1'
const SOURCES_TTL_SECONDS = 60 * 60 * 24 * 30
const CATALOG_LIMIT = 250
const CHANGE_LIST_LIMIT = 40
const COMING_DAYS = 21
const MONTHLY_TTL_SECONDS = 60 * 60 * 24 * 62
const MONTHLY_LIST_LIMIT = 250

interface WatchmodeSourceInfo {
  id: number
  name: string
}

interface WatchmodeTitle {
  tmdb_id?: number | null
  tmdb_type?: string
  title: string
  year?: number | null
}

interface WatchmodeRelease {
  source_id: number
  tmdb_id?: number | null
  tmdb_type?: string
  type: string
  title: string
  source_release_date: string
  season_number?: number | null
}

export interface CatalogTitle {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  year: number | null
}

export interface ComingTitle {
  tmdbId: number
  tmdbType: MediaType
  title: string
  date: string
  season: number | null
}

export interface ProviderChanges {
  source: string
  updatedAt: number
  added: CatalogTitle[]
  left: CatalogTitle[]
  coming: ComingTitle[]
}

export interface DatedCatalogTitle extends CatalogTitle {
  date: string
}

export interface MonthlyChanges {
  source: string
  month: string
  updatedAt: number
  arrived: ComingTitle[]
  coming: ComingTitle[]
  departed: DatedCatalogTitle[]
}

interface CatalogSnapshot {
  titles?: CatalogTitle[]
  updatedAt?: number
}

// Per-title view of the monthly diffs: powers "arrives on X / left Y" notices
// on detail pages and the single-title alert match. Built once a day in the
// cron; read as one hash field per pageview.
export interface TitleChangeEvent {
  p: string
  date?: string
}

export interface TitleChangeEvents {
  coming?: TitleChangeEvent[]
  added?: TitleChangeEvent[]
  left?: TitleChangeEvent[]
}

export function buildTitleIndex(entries: [string, MonthlyChanges][]): Record<string, TitleChangeEvents> {
  const index: Record<string, TitleChangeEvents> = {}
  const push = (kind: 'added' | 'left' | 'coming', tmdbType: MediaType, tmdbId: number, p: string, date?: string) => {
    const field = `${tmdbType}:${tmdbId}`
    const entry = (index[field] ||= {})
    ;(entry[kind] ||= []).push(date ? { p, date } : { p })
  }
  for (const [p, m] of entries) {
    for (const t of m.arrived) push('added', t.tmdbType, t.tmdbId, p, t.date)
    for (const t of m.departed) if (t.tmdbId) push('left', t.tmdbType, t.tmdbId, p, t.date)
    for (const t of m.coming) push('coming', t.tmdbType, t.tmdbId, p, t.date)
  }
  return index
}

const titleIndexKey = (region: string) => `changes:index:${region}`
const TITLE_INDEX_TTL_SECONDS = 60 * 60 * 24 * 4

const titleIndexMemo = new LRUCache<string, { v: TitleChangeEvents | null }>({ max: 2000, ttl: 10 * 60 * 1000 })

export async function getTitleChanges(tmdbType: MediaType, tmdbId: number, region = 'US'): Promise<TitleChangeEvents | null> {
  const memoKey = `${region}:${tmdbType}:${tmdbId}`
  const memoized = titleIndexMemo.get(memoKey)
  if (memoized !== undefined) return memoized.v

  const kv = getRedis()
  let entry: TitleChangeEvents | null = null
  if (kv) {
    try {
      entry = (await kv.hget(titleIndexKey(region), `${tmdbType}:${tmdbId}`)) as TitleChangeEvents | null
    } catch {}
  }

  // A "coming" date in the past is stale until the next cron run re-indexes.
  const today = new Date().toISOString().split('T')[0]
  if (entry?.coming) {
    const upcoming = entry.coming.filter((e) => !e.date || e.date >= today)
    entry = { ...entry, coming: upcoming.length ? upcoming : undefined }
    if (!entry.coming && !entry.added && !entry.left) entry = null
  }

  titleIndexMemo.set(memoKey, { v: entry })
  return entry
}

// Whole-hash read for jobs that need every title's events at once (sitemap
// lastmod) — one HGETALL beats per-title HGETs over ~600 entries.
export async function getTitleChangeIndex(region = 'US'): Promise<Record<string, TitleChangeEvents> | null> {
  const kv = getRedis()
  if (!kv) return null
  try {
    return (await kv.hgetall<Record<string, TitleChangeEvents>>(titleIndexKey(region))) ?? null
  } catch {
    return null
  }
}

// US keys keep their original unprefixed shape; other regions are namespaced.
const catalogKey = (providerKey: string, region = 'US') =>
  region === 'US' ? `changes:catalog:${providerKey}` : `changes:catalog:${region}:${providerKey}`
const changesKey = (providerKey: string, region = 'US') =>
  region === 'US' ? `changes:diff:${providerKey}` : `changes:diff:${region}:${providerKey}`
const monthlyKey = (providerKey: string, month: string) => `changes:monthly:${providerKey}:${month}`

async function fetchWatchmode<T>(path: string): Promise<T | null> {
  const apiKey = process.env.WATCHMODE_API_KEY
  if (!apiKey) return null
  try {
    const resp = await fetch(`${WATCHMODE_BASE}${path}`, {
      headers: { 'X-API-Key': apiKey }
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

export async function getSourceIdMap(): Promise<Record<string, WatchmodeSourceInfo>> {
  const kv = getRedis()
  if (kv) {
    try {
      const cached = await kv.get<Record<string, WatchmodeSourceInfo>>('changes:sources')
      if (cached) return cached
    } catch {}
  }

  const sources = await fetchWatchmode<(WatchmodeSourceInfo & { type: string })[]>('/sources?regions=US')
  if (!Array.isArray(sources)) return {}

  const map: Record<string, WatchmodeSourceInfo> = {}
  for (const [key, pattern] of Object.entries(PROVIDER_NAME_MATCH)) {
    // 'free' alongside 'sub' — ad-supported services (tubi/pluto/roku) are
    // typed free in Watchmode's source list, not subscription.
    const source = sources.find((s) => (s.type === 'sub' || s.type === 'free') && pattern.test(s.name))
    if (source) map[key] = { id: source.id, name: source.name }
  }

  if (kv && Object.keys(map).length > 0) {
    try {
      await kv.set('changes:sources', map, { ex: SOURCES_TTL_SECONDS })
    } catch {}
  }
  return map
}

const normalizeTitle = (t: WatchmodeTitle): CatalogTitle => ({
  tmdbId: t.tmdb_id ?? null,
  tmdbType: t.tmdb_type === 'tv' ? 'tv' : 'movie',
  title: t.title,
  year: t.year ?? null
})

async function fetchCatalog(sourceId: number): Promise<CatalogTitle[]> {
  const data = await fetchWatchmode<{ titles?: WatchmodeTitle[] }>(
    `/list-titles?source_ids=${sourceId}&types=movie,tv_series&regions=US&sort_by=popularity_desc&limit=${CATALOG_LIMIT}`
  )
  return (data?.titles || []).map(normalizeTitle).filter((t) => t.tmdbId)
}

export const IN_TRACKED_PROVIDERS = Object.keys(streamingProviders).filter((key) => isProviderAvailableInRegion(key, 'IN'))

// India's daily snapshots come from TMDB discover, not Watchmode — its source
// list is US-centric and TMDB calls here are free. TMDB only exposes current
// availability, so IN diffs track added/left but never "coming soon".
const TMDB_CATALOG_PAGES = 13 // ~250 titles per media type at 20/page

async function fetchTmdbCatalog(providerKey: string): Promise<CatalogTitle[]> {
  const providerId = getProviderIds(providerKey, 'IN').join('|')
  const seen = new Map<string, CatalogTitle>()
  for (const tmdbType of ['movie', 'tv'] as const) {
    for (let page = 1; page <= TMDB_CATALOG_PAGES; page++) {
      const data = tmdbType === 'movie'
        ? await fetchDiscoverMovies({ providerId, region: 'IN', page })
        : await fetchDiscoverTv({ providerId, region: 'IN', page })
      const results = (data.results || []) as TitleSummary[]
      for (const t of results) {
        const year = (t.release_date || t.first_air_date || '').slice(0, 4)
        seen.set(`${tmdbType}:${t.id}`, {
          tmdbId: t.id,
          tmdbType,
          title: t.title || t.name || '',
          year: year ? Number(year) : null
        })
      }
      if (results.length < 20 || page >= (data.total_pages || 1)) break
    }
  }
  return [...seen.values()].slice(0, CATALOG_LIMIT)
}

const dateStamp = (date: Date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`

// Watchmode's /releases can't look backward on our plan — start_date must be
// today or later. Starting at today lets the monthly record stamp arrivals with
// their true release date; anything earlier has to come from catalog diffs.
async function fetchUpcoming(sourceIds: Set<number>): Promise<Record<number, ComingTitle[]>> {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + COMING_DAYS)

  const data = await fetchWatchmode<{ releases?: WatchmodeRelease[] }>(
    `/releases?start_date=${dateStamp(start)}&end_date=${dateStamp(end)}&limit=250`
  )
  const releases = (data?.releases || []).filter(
    (r): r is WatchmodeRelease & { tmdb_id: number } =>
      sourceIds.has(r.source_id) && Boolean(r.tmdb_id) && (r.type === 'movie' || r.type === 'tv_series')
  )

  const bySource: Record<number, ComingTitle[]> = {}
  for (const r of releases) {
    bySource[r.source_id] = bySource[r.source_id] || []
    bySource[r.source_id].push({
      tmdbId: r.tmdb_id,
      tmdbType: r.tmdb_type === 'tv' ? 'tv' : 'movie',
      title: r.title,
      date: r.source_release_date,
      season: r.season_number ?? null
    })
  }
  return bySource
}

export async function updateStreamingChanges() {
  const kv = getRedis()
  if (!kv) return { error: 'Redis unavailable' }

  const summary: Record<string, { added: number; left: number; coming: number; catalog: number } | string> = {}

  // Every diff item is a detail page whose "where to watch" answer just
  // changed — collect their URLs and ping IndexNow once at the end so Bing
  // recrawls them before the search-demand spike, not weeks after.
  const indexNowUrls = new Set<string>()
  const pushTitleUrls = (items: { tmdbId: number | null; tmdbType: MediaType }[]) => {
    for (const t of items) {
      if (t.tmdbId) indexNowUrls.add(`${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`)
    }
  }

  const sourceMap = await getSourceIdMap()
  if (Object.keys(sourceMap).length === 0) {
    summary.error = 'No Watchmode sources resolved'
  }
  const monthliesForIndex: [string, MonthlyChanges][] = []

  if (Object.keys(sourceMap).length > 0) {
    const upcoming = await fetchUpcoming(new Set(Object.values(sourceMap).map((s) => s.id)))

    const today = new Date().toISOString().split('T')[0]
    const month = today.slice(0, 7)
    const prevMonthly = new Map(
      await Promise.all(
        Object.keys(sourceMap).map(async (key): Promise<[string, MonthlyChanges | null]> => [
          key,
          await kv.get<MonthlyChanges>(monthlyKey(key, month)).catch(() => null)
        ])
      )
    )

    for (const [key, source] of Object.entries(sourceMap)) {
      const catalog = await fetchCatalog(source.id)
      // An empty fetch means Watchmode errored (or the source vanished) — skip
      // rather than overwriting the baseline and reporting every title as left.
      if (!catalog.length) {
        summary[key] = 'skipped: empty catalog'
        // Keep the skipped provider's last monthly in the title index so its
        // entries don't vanish until it fetches successfully again.
        const stored = await kv.get<MonthlyChanges>(monthlyKey(key, month)).catch(() => null)
        if (stored) monthliesForIndex.push([key, stored])
        continue
      }
      const previous = await kv.get<CatalogSnapshot>(catalogKey(key)).catch(() => null)

      const prevIds = new Set((previous?.titles || []).map((t) => t.tmdbId))
      const nextIds = new Set(catalog.map((t) => t.tmdbId))

      // First run seeds the baseline with no diff — otherwise every title in the
      // catalog would show as "just added".
      const hasBaseline = Array.isArray(previous?.titles)
      const added = hasBaseline ? catalog.filter((t) => !prevIds.has(t.tmdbId)) : []
      const left = hasBaseline
        ? (previous?.titles || []).filter((t) => !nextIds.has(t.tmdbId))
        : []

      const releases = upcoming[source.id] || []
      const payload: ProviderChanges = {
        source: source.name,
        updatedAt: Date.now(),
        added: added.slice(0, CHANGE_LIST_LIMIT),
        left: left.slice(0, CHANGE_LIST_LIMIT),
        coming: releases.filter((r) => r.date > today).slice(0, CHANGE_LIST_LIMIT)
      }

      // Dated monthly accumulation backs /leaving/[provider]. Release-feed dates
      // are the true on-service dates; diff detections get stamped with today.
      const prev = prevMonthly.get(key)
      const arrived = new Map<number, ComingTitle>()
      for (const t of prev?.arrived || []) arrived.set(t.tmdbId, t)
      for (const t of added) {
        if (t.tmdbId && !arrived.has(t.tmdbId)) {
          arrived.set(t.tmdbId, { tmdbId: t.tmdbId, tmdbType: t.tmdbType, title: t.title, date: today, season: null })
        }
      }
      for (const t of releases.filter((r) => r.date <= today)) arrived.set(t.tmdbId, t)

      const departed = new Map<number, DatedCatalogTitle>()
      for (const t of prev?.departed || []) if (t.tmdbId) departed.set(t.tmdbId, t)
      for (const t of added) if (t.tmdbId) departed.delete(t.tmdbId)
      for (const t of left) {
        if (t.tmdbId) {
          arrived.delete(t.tmdbId)
          departed.set(t.tmdbId, { ...t, date: today })
        }
      }

      const monthly: MonthlyChanges = {
        source: source.name,
        month,
        updatedAt: Date.now(),
        arrived: [...arrived.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MONTHLY_LIST_LIMIT),
        coming: releases.filter((r) => r.date > today).slice(0, MONTHLY_LIST_LIMIT),
        departed: [...departed.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MONTHLY_LIST_LIMIT)
      }

      await kv.set(catalogKey(key), { titles: catalog, updatedAt: Date.now() })
      await kv.set(changesKey(key), payload)
      await kv.set(monthlyKey(key, month), monthly, { ex: MONTHLY_TTL_SECONDS })
      monthliesForIndex.push([key, monthly])
      pushTitleUrls([...payload.added, ...payload.coming, ...payload.left])
      if (payload.added.length || payload.left.length || payload.coming.length) {
        indexNowUrls.add(`${SITE_URL}/streaming/${key}`)
        indexNowUrls.add(`${SITE_URL}/leaving/${key}`)
      }
      summary[key] = { added: added.length, left: left.length, coming: payload.coming.length, catalog: catalog.length }
    }
  }

  if (monthliesForIndex.length) {
    try {
      await kv.hset(titleIndexKey('US'), buildTitleIndex(monthliesForIndex))
      await kv.expire(titleIndexKey('US'), TITLE_INDEX_TTL_SECONDS)
    } catch (error) {
      console.error('title index write failed:', error)
    }
  }

  for (const key of IN_TRACKED_PROVIDERS) {
    try {
      const catalog = await fetchTmdbCatalog(key)
      if (!catalog.length) continue
      const previous = await kv.get<CatalogSnapshot>(catalogKey(key, 'IN')).catch(() => null)

      const prevIds = new Set((previous?.titles || []).map((t) => t.tmdbId))
      const nextIds = new Set(catalog.map((t) => t.tmdbId))
      const hasBaseline = Array.isArray(previous?.titles)
      const added = hasBaseline ? catalog.filter((t) => !prevIds.has(t.tmdbId)) : []
      const left = hasBaseline
        ? (previous?.titles || []).filter((t) => !nextIds.has(t.tmdbId))
        : []

      const payload: ProviderChanges = {
        source: streamingProviders[key].title.replace(/ Movies$/, ''),
        updatedAt: Date.now(),
        added: added.slice(0, CHANGE_LIST_LIMIT),
        left: left.slice(0, CHANGE_LIST_LIMIT),
        coming: []
      }

      await kv.set(catalogKey(key, 'IN'), { titles: catalog, updatedAt: Date.now() })
      await kv.set(changesKey(key, 'IN'), payload)
      pushTitleUrls([...payload.added, ...payload.left])
      summary[`in:${key}`] = { added: added.length, left: left.length, coming: 0, catalog: catalog.length }
    } catch (error) {
      console.error(`in catalog update failed for ${key}:`, error)
    }
  }

  // Trending-week titles ride the "where to watch X" search spikes — ping them
  // daily so Bing indexes the hot set even on days with no provider diff hits.
  const [trendingMovies, trendingTv] = await Promise.all([
    fetchTmdb<TmdbPaged<TmdbMovie>>('/trending/movie/week', { page: 1 }).catch((): null => null),
    fetchTmdb<TmdbPaged<TmdbTvShow>>('/trending/tv/week', { page: 1 }).catch((): null => null)
  ])
  for (const t of trendingMovies?.results || []) if (t?.id) indexNowUrls.add(`${SITE_URL}/movies/${t.id}`)
  for (const t of trendingTv?.results || []) if (t?.id) indexNowUrls.add(`${SITE_URL}/tv/${t.id}`)

  if (indexNowUrls.size) {
    indexNowUrls.add(`${SITE_URL}/new-on-streaming`)
    await pingIndexNow([...indexNowUrls])
  }

  return summary
}

// Diffs are rewritten once a day by the streaming-changes cron but were being
// re-read once per key on every pageview — the memo turns repeat page loads
// into zero Redis commands. Cron callers pass fresh to skip it, so alerts
// never match subscribers against a diff the current cron just replaced.
const CHANGES_MEMO_MS = 10 * 60 * 1000
const changesMemo = new LRUCache<string, Record<string, ProviderChanges>>({ max: 64, ttl: CHANGES_MEMO_MS })

export async function getProviderChanges(
  providerKeys: string[] = [],
  { fresh = false, region = 'US' }: { fresh?: boolean; region?: string } = {}
): Promise<Record<string, ProviderChanges>> {
  const memoKey = `${region}:${[...providerKeys].sort().join(',')}`
  if (!fresh) {
    const memoized = changesMemo.get(memoKey)
    if (memoized) return memoized
  }

  const kv = getRedis()
  if (!kv) return {}

  const entries = await Promise.all(
    providerKeys.map(async (key): Promise<[string, ProviderChanges | null]> => {
      try {
        const data = await kv.get<ProviderChanges>(changesKey(key, region))
        return [key, data]
      } catch {
        return [key, null]
      }
    })
  )
  const changes = Object.fromEntries(entries.filter((entry): entry is [string, ProviderChanges] => Boolean(entry[1])))
  changesMemo.set(memoKey, changes)
  return changes
}

const monthlyMemo = new LRUCache<string, Record<string, MonthlyChanges>>({ max: 64, ttl: CHANGES_MEMO_MS })

export async function getMonthlyChanges(providerKeys: string[] = []): Promise<Record<string, MonthlyChanges>> {
  const kv = getRedis()
  if (!kv || !providerKeys.length) return {}

  const month = new Date().toISOString().split('T')[0].slice(0, 7)
  const memoKey = `${month}:${[...providerKeys].sort().join(',')}`
  const memoized = monthlyMemo.get(memoKey)
  if (memoized) return memoized

  const entries = await Promise.all(
    providerKeys.map(async (key): Promise<[string, MonthlyChanges | null]> => {
      try {
        const data = await kv.get<MonthlyChanges>(monthlyKey(key, month))
        return [key, data]
      } catch {
        return [key, null]
      }
    })
  )
  const changes = Object.fromEntries(entries.filter((entry): entry is [string, MonthlyChanges] => Boolean(entry[1])))
  monthlyMemo.set(memoKey, changes)
  return changes
}
