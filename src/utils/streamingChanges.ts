import { LRUCache } from 'lru-cache'
import { getRedis } from './redis'
import { fetchDiscoverMovies, fetchDiscoverTv, getProviderIds, isProviderAvailableInRegion, streamingProviders } from './tmdb'
import type { MediaType, TitleSummary } from '../types/tmdb'

const WATCHMODE_BASE = 'https://api.watchmode.com/v1'
const SOURCES_TTL_SECONDS = 60 * 60 * 24 * 30
const CATALOG_LIMIT = 250
const CHANGE_LIST_LIMIT = 40
const COMING_DAYS = 21

// Our provider keys (utils/tmdb streamingProviders) → Watchmode source names.
export const PROVIDER_NAME_MATCH: Record<string, RegExp> = {
  'netflix': /^netflix/i,
  'amazon-prime-video': /^(amazon prime|prime video)/i,
  'hulu': /^hulu/i,
  'disney-plus': /disney/i,
  'apple-tv': /apple ?tv\+?/i,
  'max': /^(max|hbo max)$/i,
  'peacock': /^peacock/i,
  'paramount-plus': /^paramount\+|paramount plus/i
}

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

interface CatalogSnapshot {
  titles?: CatalogTitle[]
  updatedAt?: number
}

// US keys keep their original unprefixed shape; other regions are namespaced.
const catalogKey = (providerKey: string, region = 'US') =>
  region === 'US' ? `changes:catalog:${providerKey}` : `changes:catalog:${region}:${providerKey}`
const changesKey = (providerKey: string, region = 'US') =>
  region === 'US' ? `changes:diff:${providerKey}` : `changes:diff:${region}:${providerKey}`

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
    const source = sources.find((s) => s.type === 'sub' && pattern.test(s.name))
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

async function fetchUpcoming(sourceIds: Set<number>): Promise<Record<number, ComingTitle[]>> {
  const start = new Date()
  start.setDate(start.getDate() + 1)
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

  const sourceMap = await getSourceIdMap()
  if (Object.keys(sourceMap).length === 0) {
    summary.error = 'No Watchmode sources resolved'
  }
  if (Object.keys(sourceMap).length > 0) {
    const upcoming = await fetchUpcoming(new Set(Object.values(sourceMap).map((s) => s.id)))

    for (const [key, source] of Object.entries(sourceMap)) {
      const catalog = await fetchCatalog(source.id)
      // An empty fetch means Watchmode errored (or the source vanished) — skip
      // rather than overwriting the baseline and reporting every title as left.
      if (!catalog.length) {
        summary[key] = 'skipped: empty catalog'
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

      const payload: ProviderChanges = {
        source: source.name,
        updatedAt: Date.now(),
        added: added.slice(0, CHANGE_LIST_LIMIT),
        left: left.slice(0, CHANGE_LIST_LIMIT),
        coming: (upcoming[source.id] || []).slice(0, CHANGE_LIST_LIMIT)
      }

      await kv.set(catalogKey(key), { titles: catalog, updatedAt: Date.now() })
      await kv.set(changesKey(key), payload)
      summary[key] = { added: added.length, left: left.length, coming: payload.coming.length, catalog: catalog.length }
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
      summary[`in:${key}`] = { added: added.length, left: left.length, coming: 0, catalog: catalog.length }
    } catch (error) {
      console.error(`in catalog update failed for ${key}:`, error)
    }
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
