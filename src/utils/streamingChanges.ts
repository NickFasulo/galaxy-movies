import { LRUCache } from 'lru-cache'
import { getRedis } from './redis'
import { PROVIDER_NAME_MATCH } from './tmdb'
import type { MediaType } from '../types/tmdb'

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

const catalogKey = (providerKey: string) => `changes:catalog:${providerKey}`
const changesKey = (providerKey: string) => `changes:diff:${providerKey}`
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

  const sourceMap = await getSourceIdMap()
  const keys = Object.keys(sourceMap)
  if (keys.length === 0) return { error: 'No Watchmode sources resolved' }

  const upcoming = await fetchUpcoming(new Set(Object.values(sourceMap).map((s) => s.id)))

  const today = new Date().toISOString().split('T')[0]
  const month = today.slice(0, 7)
  const prevMonthly = new Map(
    await Promise.all(
      keys.map(async (key): Promise<[string, MonthlyChanges | null]> => [
        key,
        await kv.get<MonthlyChanges>(monthlyKey(key, month)).catch(() => null)
      ])
    )
  )

  const summary: Record<string, { added: number; left: number; coming: number; catalog: number }> = {}
  for (const [key, source] of Object.entries(sourceMap)) {
    const catalog = await fetchCatalog(source.id)
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
    summary[key] = { added: added.length, left: left.length, coming: payload.coming.length, catalog: catalog.length }
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
  { fresh = false }: { fresh?: boolean } = {}
): Promise<Record<string, ProviderChanges>> {
  const memoKey = [...providerKeys].sort().join(',')
  if (!fresh) {
    const memoized = changesMemo.get(memoKey)
    if (memoized) return memoized
  }

  const kv = getRedis()
  if (!kv) return {}

  const entries = await Promise.all(
    providerKeys.map(async (key): Promise<[string, ProviderChanges | null]> => {
      try {
        const data = await kv.get<ProviderChanges>(changesKey(key))
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
