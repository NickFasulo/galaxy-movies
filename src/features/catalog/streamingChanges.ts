import { LRUCache } from 'lru-cache'
import { getRedis } from '../../lib/redis'
import { fetchDiscoverMovies, fetchDiscoverTv, fetchTmdb, getProviderIds, isProviderAvailableInRegion, streamingProviders, PROVIDER_NAME_MATCH } from './tmdb'
import { recordWatchmodeResponse, watchmodeQuotaExceeded } from './watchmodeQuota'
import { recordProviderMoves } from './tenure'
import { warmAiTitleCache, type WarmCandidate } from '../ai/warmCache'
import { pingIndexNow } from '../../lib/indexnow'
import { submitDailyBatch } from '../indexing/bingSubmit'
import { SITE_URL } from '../../lib/site'
import type { MediaType, TitleSummary, TmdbMovie, TmdbPaged, TmdbTvShow, WatchProvidersResponse } from '../../types/tmdb'

const WATCHMODE_BASE = 'https://api.watchmode.com/v1'
const SOURCES_TTL_SECONDS = 60 * 60 * 24 * 30
// No-TTL shadow of changes:sources, written on every successful /sources fetch.
const SOURCES_STALE_KEY = 'changes:sources:stale'
const CATALOG_LIMIT = 1600
const CHANGE_LIST_LIMIT = 40
const COMING_DAYS = 21
const MONTHLY_TTL_SECONDS = 60 * 60 * 24 * 62
const MONTHLY_LIST_LIMIT = 250

interface WatchmodeSourceInfo {
  id: number
  name: string
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

// /title-leaving-dates payload — no tmdb_id or year, so items resolve back to
// TMDB by normalized title match against that provider's own catalog snapshot.
interface WatchmodeLeaving {
  id: number
  title: string
  title_type?: string
  provider_id: number
  leaving_date: string
  season?: number | null
}

export interface CatalogTitle {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  year: number | null
  popularity?: number
  // Snapshot bookkeeping: first-seen date while an add is probationary —
  // promotes (or vanishes) on its next sighting. Absent on confirmed titles.
  pending?: string
}

export interface ComingTitle {
  tmdbId: number
  tmdbType: MediaType
  title: string
  date: string
  season: number | null
  popularity?: number
}

// tmdbId is null when the title can't be matched to our catalog snapshot —
// the row still renders (unlinked) on leaving pages.
export interface LeavingSoonTitle {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  date: string
  season: number | null
  popularity?: number
}

export interface ProviderChanges {
  source: string
  updatedAt: number
  added: CatalogTitle[]
  left: CatalogTitle[]
  coming: ComingTitle[]
  leavingSoon?: LeavingSoonTitle[]
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
  leavingSoon?: LeavingSoonTitle[]
}

interface PendingDeparture {
  // First-miss date — the departure date once promoted.
  d: string
  // Last date a watch/providers check still showed the provider attached.
  v?: string
  title: CatalogTitle
}

interface CatalogSnapshot {
  titles?: CatalogTitle[]
  updatedAt?: number
  // Snapshots built before catalogs moved to TMDB lack this marker — they're
  // not valid baselines for the new composition and reseed quietly once.
  src?: string
  // Titles absent from consecutive snapshots, awaiting confirmation before
  // they publish as "left" — kills discover/metadata flapping at the boundary.
  pendingLeft?: Record<string, PendingDeparture>
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
  leaving?: TitleChangeEvent[]
}

export function buildTitleIndex(entries: [string, MonthlyChanges][]): Record<string, TitleChangeEvents> {
  const index: Record<string, TitleChangeEvents> = {}
  const push = (kind: 'added' | 'left' | 'coming' | 'leaving', tmdbType: MediaType, tmdbId: number, p: string, date?: string) => {
    const field = `${tmdbType}:${tmdbId}`
    const entry = (index[field] ||= {})
    ;(entry[kind] ||= []).push(date ? { p, date } : { p })
  }
  for (const [p, m] of entries) {
    for (const t of m.arrived) push('added', t.tmdbType, t.tmdbId, p, t.date)
    for (const t of m.departed) if (t.tmdbId) push('left', t.tmdbType, t.tmdbId, p, t.date)
    for (const t of m.coming) push('coming', t.tmdbType, t.tmdbId, p, t.date)
    for (const t of m.leavingSoon || []) if (t.tmdbId) push('leaving', t.tmdbType, t.tmdbId, p, t.date)
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

  // Future-dated events go stale between daily cron re-indexes — a "coming"
  // or scheduled "leaving" date in the past shouldn't keep rendering.
  const today = new Date().toISOString().split('T')[0]
  if (entry?.coming || entry?.leaving) {
    const upcoming = entry.coming?.filter((e) => !e.date || e.date >= today)
    const departing = entry.leaving?.filter((e) => !e.date || e.date >= today)
    entry = {
      ...entry,
      coming: upcoming?.length ? upcoming : undefined,
      leaving: departing?.length ? departing : undefined
    }
    if (!entry.coming && !entry.leaving && !entry.added && !entry.left) entry = null
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
const yearHashKey = (region: 'US' | 'IN', year: string) => `changes:year:${region}:${year}`
const sizeHashKey = (region: 'US' | 'IN', year: string) => `catalog:size:${region}:${year}`

const YEAR_TTL_SECONDS = 60 * 60 * 24 * 400
const YEAR_LIST_LIMIT = 150

const byPopularity = <T extends { popularity?: number }>(a: T, b: T) => (b.popularity ?? 0) - (a.popularity ?? 0)

// Monthly diffs expire after MONTHLY_TTL_SECONDS (~2 months) — the year hash
// keeps a durable per-provider/month rollup so a recap can exist at all.
export interface YearlyChanges {
  source: string
  month: string
  updatedAt: number
  arrived: ComingTitle[]
  departed: DatedCatalogTitle[]
}

// coming/leavingSoon go stale within weeks — a recap only needs what moved.
export function yearlyFromMonthly(monthly: MonthlyChanges): YearlyChanges {
  return {
    source: monthly.source,
    month: monthly.month,
    updatedAt: monthly.updatedAt,
    arrived: monthly.arrived.slice(0, YEAR_LIST_LIMIT),
    departed: monthly.departed.slice(0, YEAR_LIST_LIMIT)
  }
}

// IN monthlies are written under `IN:{provider}` keys (backs the /in/ diff
// pages); the year hash still merges each run's diff directly for durability.
export function mergeYearlyDiff(
  existing: YearlyChanges | null,
  source: string,
  month: string,
  added: CatalogTitle[],
  left: CatalogTitle[],
  today: string
): YearlyChanges {
  const arrived = new Map<number, ComingTitle>()
  for (const t of existing?.arrived || []) arrived.set(t.tmdbId, t)
  const departed = new Map<number, DatedCatalogTitle>()
  for (const t of existing?.departed || []) if (t.tmdbId) departed.set(t.tmdbId, t)
  for (const t of added) {
    if (!t.tmdbId) continue
    departed.delete(t.tmdbId)
    if (!arrived.has(t.tmdbId)) {
      arrived.set(t.tmdbId, { tmdbId: t.tmdbId, tmdbType: t.tmdbType, title: t.title, date: today, season: null, popularity: t.popularity })
    }
  }
  for (const t of left) {
    if (!t.tmdbId) continue
    arrived.delete(t.tmdbId)
    departed.set(t.tmdbId, { ...t, date: today })
  }
  return {
    source,
    month,
    updatedAt: Date.now(),
    arrived: [...arrived.values()].sort(byPopularity).slice(0, YEAR_LIST_LIMIT),
    departed: [...departed.values()].sort(byPopularity).slice(0, YEAR_LIST_LIMIT)
  }
}

async function fetchWatchmode<T>(path: string): Promise<T | null> {
  const apiKey = process.env.WATCHMODE_API_KEY
  if (!apiKey) return null
  // Prices lookups stop at 90% of quota so the cron keeps a reserved tail —
  // the cron only stands down when the account is essentially empty.
  if (await watchmodeQuotaExceeded(0.99)) return null
  try {
    const resp = await fetch(`${WATCHMODE_BASE}${path}`, {
      headers: { 'X-API-Key': apiKey }
    })
    recordWatchmodeResponse(resp)
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
  if (!Array.isArray(sources)) {
    // Dead upstream shouldn't take the diff pipeline down with it — serve the
    // last good map until /sources recovers.
    if (kv) {
      try {
        const stale = await kv.get<Record<string, WatchmodeSourceInfo>>(SOURCES_STALE_KEY)
        if (stale) return stale
      } catch {}
    }
    return {}
  }

  const map: Record<string, WatchmodeSourceInfo> = {}
  for (const [key, pattern] of Object.entries(PROVIDER_NAME_MATCH)) {
    // 'free' alongside 'sub' — ad-supported services (tubi/pluto/roku) are
    // typed free in Watchmode's source list, not subscription.
    // Add-on channels ("AMC+ Amazon Channel", "Hulu on Disney+", "Paramount+
    // with Showtime") also satisfy the patterns — the canonical service is the
    // shortest candidate name.
    const source = sources
      .filter((s) => (s.type === 'sub' || s.type === 'free') && pattern.test(s.name))
      .sort((a, b) => a.name.length - b.name.length)[0]
    if (source) map[key] = { id: source.id, name: source.name }
  }

  if (kv && Object.keys(map).length > 0) {
    try {
      await kv.set('changes:sources', map, { ex: SOURCES_TTL_SECONDS })
      await kv.set(SOURCES_STALE_KEY, map)
    } catch {}
  }
  return map
}

export const IN_TRACKED_PROVIDERS = Object.keys(streamingProviders).filter((key) => isProviderAvailableInRegion(key, 'IN'))

// Provider catalogs (US and IN) come straight from TMDB discover — by watch
// provider + region + subscription/free/ads monetization — so no Watchmode
// credits are burned on snapshots. TMDB only exposes current availability;
// dated arrivals/departures still come from Watchmode releases/leaving feeds.
const TMDB_MONETIZATION_TYPES = 'flatrate|free|ads'
// Snapshot composition/version marker — pending/verified diff state makes
// 'tmdb:v1' snapshots invalid baselines, so they reseed quietly once.
const SNAPSHOT_SRC = 'tmdb:v2'
// ~800 titles per media type at 20/page. A deeper snapshot moves the diff
// boundary from rank ~250 — where popularity churn fakes adds/lefts — into a
// tail that barely moves.
const CATALOG_PAGES = Number(process.env.CATALOG_PAGES) || 40
const PAGE_BATCH = 10
const PROVIDER_CHUNK = 3
const LEFT_VERIFY_BUDGET = 20
const LEFT_REVERIFY_DAYS = 3

async function fetchTmdbCatalog(providerKey: string, region: string): Promise<{ titles: CatalogTitle[]; size: { m: number; t: number } }> {
  const providerId = getProviderIds(providerKey, region).join('|')
  if (!providerId) return { titles: [], size: { m: 0, t: 0 } }
  const seen = new Map<string, CatalogTitle>()
  const size = { m: 0, t: 0 }

  const fetchType = async (tmdbType: 'movie' | 'tv') => {
    // voteFloor 1 vs the 10 used elsewhere: regional catalogs carry plenty of
    // titles TMDB barely tracks votes for, and they're still real members.
    const base = { providerId, region, monetizationTypes: TMDB_MONETIZATION_TYPES, voteFloor: 1 }
    const call = (page: number) =>
      tmdbType === 'movie' ? fetchDiscoverMovies({ ...base, page }) : fetchDiscoverTv({ ...base, page })
    const first = await call(1)
    size[tmdbType === 'movie' ? 'm' : 't'] += first.total_results || 0
    const last = Math.min(first.total_pages || 1, CATALOG_PAGES)
    const pages = [first]
    for (let i = 2; i <= last; i += PAGE_BATCH) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(PAGE_BATCH, last - i + 1) }, (_, k) => call(i + k))
      )
      pages.push(...batch)
    }
    for (const data of pages) {
      for (const t of (data.results || []) as TitleSummary[]) {
        const year = (t.release_date || t.first_air_date || '').slice(0, 4)
        seen.set(`${tmdbType}:${t.id}`, {
          tmdbId: t.id,
          tmdbType,
          title: t.title || t.name || '',
          year: year ? Number(year) : null,
          popularity: typeof t.popularity === 'number' ? t.popularity : undefined
        })
      }
    }
  }

  await Promise.all([fetchType('movie'), fetchType('tv')])
  // Merged cap must rank across types — otherwise a large movie catalog could
  // evict every TV title by insertion order.
  return {
    titles: [...seen.values()]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, CATALOG_LIMIT),
    size
  }
}

async function mapChunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

const fieldKey = (t: { tmdbType: MediaType; tmdbId: number | null }) => `${t.tmdbType}:${t.tmdbId}`

const dayAge = (date: string, today: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86400000)

// Per-title watch/providers is the availability ground truth that the discover
// provider filter lags behind — a departure that still shows the provider
// attached is a catalog-snapshot anomaly, not a real "left".
async function stillOnProvider(t: CatalogTitle, providerKey: string, region: string): Promise<boolean | null> {
  try {
    const data = await fetchTmdb<WatchProvidersResponse>(`/${t.tmdbType}/${t.tmdbId}/watch/providers`)
    const offers = data.results?.[region]
    if (!offers) return false
    const ids = new Set(getProviderIds(providerKey, region))
    return [...(offers.flatrate || []), ...(offers.ads || []), ...(offers.free || [])]
      .some((p) => ids.has(p.provider_id))
  } catch {
    return null
  }
}

interface CatalogDiff {
  added: CatalogTitle[]
  left: CatalogTitle[]
  // Snapshot.titles replacement: current members plus still-pending adds.
  confirmed: CatalogTitle[]
  pendingLeft: Record<string, PendingDeparture>
  // First-seen / first-miss dates for promoted items — truer than stamping
  // publish day, since promotion lands a run after detection.
  arriveDate: Map<number, string>
  departDate: Map<number, string>
  pendingCount: number
}

async function diffCatalogs(opts: {
  catalog: CatalogTitle[]
  previous: CatalogSnapshot | null
  today: string
  feedIds?: Set<string>
  scheduledDeparture?: Map<number, string>
  stillOn?: (t: CatalogTitle) => Promise<boolean | null>
  verifyBudget?: number
}): Promise<CatalogDiff> {
  const { catalog, previous, today } = opts
  const feedIds = opts.feedIds ?? new Set<string>()
  const scheduledDeparture = opts.scheduledDeparture ?? new Map<number, string>()
  const stillOn = opts.stillOn
  let verifyBudget = opts.verifyBudget ?? 0

  const prevTitles = previous?.titles || []
  const prevByField = new Map<string, CatalogTitle>()
  for (const t of prevTitles) if (t.tmdbId) prevByField.set(fieldKey(t), t)
  const nextIds = new Set<string>()
  for (const t of catalog) if (t.tmdbId) nextIds.add(fieldKey(t))
  const hasBaseline = Array.isArray(previous?.titles) && previous?.src === SNAPSHOT_SRC

  const added: CatalogTitle[] = []
  const confirmed: CatalogTitle[] = []
  const arriveDate = new Map<number, string>()
  let pendingAdds = 0
  for (const t of catalog) {
    const f = fieldKey(t)
    const prev = prevByField.get(f)
    if (!hasBaseline || (prev && !prev.pending)) {
      confirmed.push(t)
      continue
    }
    if (prev?.pending) {
      added.push(t)
      arriveDate.set(t.tmdbId!, prev.pending)
      confirmed.push(t)
      continue
    }
    if (feedIds.has(f)) {
      added.push(t)
      confirmed.push(t)
      continue
    }
    pendingAdds++
    confirmed.push({ ...t, pending: today })
  }

  const left: CatalogTitle[] = []
  const departDate = new Map<number, string>()
  const pendingLeft: Record<string, PendingDeparture> = {}

  if (hasBaseline) {
    const verifyQueue: { f: string; rec: PendingDeparture }[] = []
    for (const [f, rec] of Object.entries(previous?.pendingLeft || {})) {
      // Back in the catalog — the flap dies unreported.
      if (nextIds.has(f)) continue
      const scheduled = rec.title.tmdbId ? scheduledDeparture.get(rec.title.tmdbId) : undefined
      if (scheduled) {
        left.push(rec.title)
        departDate.set(rec.title.tmdbId!, scheduled)
      } else {
        verifyQueue.push({ f, rec })
      }
    }
    for (const t of prevTitles) {
      if (!t.tmdbId || t.pending || nextIds.has(fieldKey(t))) continue
      const scheduled = scheduledDeparture.get(t.tmdbId)
      if (scheduled) {
        left.push(t)
        departDate.set(t.tmdbId, scheduled)
      } else {
        pendingLeft[fieldKey(t)] = { d: today, title: t }
      }
    }
    for (const { f, rec } of verifyQueue) {
      const recheckDue = !rec.v || dayAge(rec.v, today) >= LEFT_REVERIFY_DAYS
      if (stillOn && verifyBudget > 0 && recheckDue) {
        verifyBudget--
        const on = await stillOn(rec.title)
        if (on == null) {
          pendingLeft[f] = rec
          continue
        }
        if (on) {
          pendingLeft[f] = { ...rec, v: today }
          continue
        }
      } else if (rec.v && !recheckDue) {
        pendingLeft[f] = rec
        continue
      }
      left.push(rec.title)
      departDate.set(rec.title.tmdbId!, rec.d)
    }
  }

  return {
    added,
    left,
    confirmed,
    pendingLeft,
    arriveDate,
    departDate,
    pendingCount: pendingAdds + Object.keys(pendingLeft).length
  }
}

// Free plan returns an unfiltered 10-title preview across all tracked sources
// (start/end/source filters are paid-only). `regions` still works.
async function fetchLeavingSoon(): Promise<WatchmodeLeaving[]> {
  const data = await fetchWatchmode<{ leaving_dates?: WatchmodeLeaving[] }>('/title-leaving-dates/?regions=US')
  return data?.leaving_dates || []
}

// Watchmode leaving items carry no tmdb_id — match by normalized title text
// against the provider's own catalog snapshot (dates are a guide, not a deadline).
function normalizeForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function wmTitleTypeToMedia(type?: string): MediaType {
  return type === 'tv_series' || type === 'tv_miniseries' || type === 'tv_special' || type === 'tv' ? 'tv' : 'movie'
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

  const summary: Record<string, { added: number; left: number; coming: number; catalog: number; pending?: number } | string | number> = {}

  // Every diff item is a detail page whose "where to watch" answer just
  // changed — collect their URLs and ping IndexNow once at the end so Bing
  // recrawls them before the search-demand spike, not weeks after.
  const indexNowUrls = new Set<string>()
  const warmCandidates: WarmCandidate[] = []
  const pushTitleUrls = (items: { tmdbId: number | null; tmdbType: MediaType; title?: string; popularity?: number }[]) => {
    for (const t of items) {
      if (!t.tmdbId) continue
      indexNowUrls.add(`${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`)
      if (t.title) warmCandidates.push({ id: t.tmdbId, mediaType: t.tmdbType, title: t.title, popularity: t.popularity })
    }
  }

  const sourceMap = await getSourceIdMap()
  if (Object.keys(sourceMap).length === 0) {
    summary.error = 'No Watchmode sources resolved'
  }
  const monthliesForIndex: [string, MonthlyChanges][] = []
  const yearlyUs: Record<string, YearlyChanges> = {}
  // Daily per-provider catalog totals — the durable series behind the churn
  // report's "how big is this catalog" column. Fields are {provider}:{date}.
  const sizesUs: Record<string, { m: number; t: number }> = {}
  const sizesIn: Record<string, { m: number; t: number }> = {}

  if (Object.keys(sourceMap).length > 0) {
    const [upcoming, leavingRaw] = await Promise.all([
      fetchUpcoming(new Set(Object.values(sourceMap).map((s) => s.id))),
      fetchLeavingSoon()
    ])
    const providerKeyBySourceId = new Map(Object.entries(sourceMap).map(([k, s]) => [s.id, k]))
    const leavingByKey: Record<string, WatchmodeLeaving[]> = {}
    for (const item of leavingRaw) {
      const key = providerKeyBySourceId.get(item.provider_id)
      if (key) (leavingByKey[key] ||= []).push(item)
    }

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

    await mapChunked(Object.entries(sourceMap), PROVIDER_CHUNK, async ([key, source]) => {
      try {
        const { titles: catalog, size } = await fetchTmdbCatalog(key, 'US')
        // An empty fetch means TMDB errored — skip rather than overwriting the
        // baseline and reporting every title as left.
        if (!catalog.length) {
          summary[key] = 'skipped: empty catalog'
          // Keep the skipped provider's last monthly in the title index so its
          // entries don't vanish until it fetches successfully again.
          const stored = await kv.get<MonthlyChanges>(monthlyKey(key, month)).catch(() => null)
          if (stored) {
            monthliesForIndex.push([key, stored])
            yearlyUs[`${key}:${month}`] = yearlyFromMonthly(stored)
          }
          return
        }
        sizesUs[`${key}:${today}`] = size
        const [previous, prevChanges] = await Promise.all([
          kv.get<CatalogSnapshot>(catalogKey(key)).catch(() => null),
          kv.get<ProviderChanges>(changesKey(key)).catch(() => null)
        ])

        // This run's scheduled departures resolve against the fresh catalog —
        // they're still on the service until their date passes. Yesterday's
        // resolved rows (stored on the diff payload) carry dates forward for
        // titles that have since dropped out of the catalog.
        const catalogByTitle = new Map(catalog.map((t) => [`${t.tmdbType}:${normalizeForMatch(t.title)}`, t]))
        const leavingSoon: LeavingSoonTitle[] = (leavingByKey[key] || []).map((item) => {
          const tmdbType = wmTitleTypeToMedia(item.title_type)
          const match = catalogByTitle.get(`${tmdbType}:${normalizeForMatch(item.title)}`)
          return {
            tmdbId: match?.tmdbId ?? null,
            tmdbType,
            title: item.title,
            date: item.leaving_date,
            season: item.season ?? null,
            popularity: match?.popularity
          }
        })
        const scheduledDeparture = new Map<number, string>()
        for (const t of prevChanges?.leavingSoon || []) if (t.tmdbId && t.date) scheduledDeparture.set(t.tmdbId, t.date)
        for (const t of leavingSoon) if (t.tmdbId && t.date) scheduledDeparture.set(t.tmdbId, t.date)

        const releases = upcoming[source.id] || []
        // Releases-feed ids corroborate first-sight adds — those publish the
        // same day; uncorroborated sightings wait for a second run.
        const feedIds = new Set(releases.map((r) => fieldKey(r)))
        const { added, left, confirmed, pendingLeft, arriveDate, departDate, pendingCount } = await diffCatalogs({
          catalog,
          previous,
          today,
          feedIds,
          scheduledDeparture,
          stillOn: (t) => stillOnProvider(t, key, 'US'),
          verifyBudget: LEFT_VERIFY_BUDGET
        })
        added.sort(byPopularity)
        left.sort(byPopularity)

        const payload: ProviderChanges = {
          source: source.name,
          updatedAt: Date.now(),
          added: added.slice(0, CHANGE_LIST_LIMIT),
          left: left.slice(0, CHANGE_LIST_LIMIT),
          coming: releases.filter((r) => r.date > today).slice(0, CHANGE_LIST_LIMIT),
          leavingSoon
        }

        // Dated monthly accumulation backs /leaving/[provider]. Release-feed and
        // leaving-feed dates are the true on/off-service dates; diff detections
        // stamp with first-seen / first-miss day.
        const prev = prevMonthly.get(key)
        const arrived = new Map<number, ComingTitle>()
        for (const t of prev?.arrived || []) arrived.set(t.tmdbId, t)
        for (const t of added) {
          if (t.tmdbId && !arrived.has(t.tmdbId)) {
            arrived.set(t.tmdbId, { tmdbId: t.tmdbId, tmdbType: t.tmdbType, title: t.title, date: arriveDate.get(t.tmdbId) || today, season: null, popularity: t.popularity })
          }
        }
        for (const t of releases.filter((r) => r.date <= today)) arrived.set(t.tmdbId, t)

        const departed = new Map<number, DatedCatalogTitle>()
        for (const t of prev?.departed || []) if (t.tmdbId) departed.set(t.tmdbId, t)
        for (const t of added) if (t.tmdbId) departed.delete(t.tmdbId)
        for (const t of left) {
          if (t.tmdbId) {
            arrived.delete(t.tmdbId)
            departed.set(t.tmdbId, { ...t, date: departDate.get(t.tmdbId) || today })
          }
        }

        const monthly: MonthlyChanges = {
          source: source.name,
          month,
          updatedAt: Date.now(),
          arrived: [...arrived.values()].sort(byPopularity).slice(0, MONTHLY_LIST_LIMIT),
          coming: releases.filter((r) => r.date > today).slice(0, MONTHLY_LIST_LIMIT),
          departed: [...departed.values()].sort(byPopularity).slice(0, MONTHLY_LIST_LIMIT),
          leavingSoon
        }

        await kv.set(catalogKey(key), { titles: confirmed, updatedAt: Date.now(), src: SNAPSHOT_SRC, pendingLeft })
        await kv.set(changesKey(key), payload)
        await kv.set(monthlyKey(key, month), monthly, { ex: MONTHLY_TTL_SECONDS })
        await recordProviderMoves('US', key, added, left, today, departDate)
        monthliesForIndex.push([key, monthly])
        yearlyUs[`${key}:${month}`] = yearlyFromMonthly(monthly)
        pushTitleUrls([...payload.added, ...payload.coming, ...payload.left, ...leavingSoon])
        if (payload.added.length || payload.left.length || payload.coming.length || leavingSoon.length) {
          indexNowUrls.add(`${SITE_URL}/streaming/${key}`)
          indexNowUrls.add(`${SITE_URL}/leaving/${key}`)
        }
        summary[key] = { added: added.length, left: left.length, coming: payload.coming.length, catalog: confirmed.length, pending: pendingCount }
      } catch (error) {
        console.error(`US catalog update failed for ${key}:`, error)
        summary[key] = 'error: fetch failed'
      }
    })

    if (Object.keys(yearlyUs).length) {
      try {
        await kv.hset(yearHashKey('US', month.slice(0, 4)), yearlyUs)
        await kv.expire(yearHashKey('US', month.slice(0, 4)), YEAR_TTL_SECONDS)
      } catch (error) {
        console.error('year rollup write failed:', error)
      }
    }
    if (Object.keys(sizesUs).length) {
      try {
        await kv.hset(sizeHashKey('US', month.slice(0, 4)), sizesUs)
        await kv.expire(sizeHashKey('US', month.slice(0, 4)), YEAR_TTL_SECONDS)
      } catch (error) {
        console.error('size index write failed:', error)
      }
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

  const inToday = new Date().toISOString().split('T')[0]
  const inMonth = inToday.slice(0, 7)
  const inYear = inToday.slice(0, 4)
  const yearlyIn: Record<string, YearlyChanges> = {}
  const monthliesForIndexIn: [string, MonthlyChanges][] = []
  const prevInMonthly = new Map(
    await Promise.all(
      IN_TRACKED_PROVIDERS.map(async (key): Promise<[string, MonthlyChanges | null]> => [
        key,
        await kv.get<MonthlyChanges>(monthlyKey(`IN:${key}`, inMonth)).catch(() => null)
      ])
    )
  )

  await mapChunked(IN_TRACKED_PROVIDERS, PROVIDER_CHUNK, async (key) => {
    try {
      const { titles: catalog, size } = await fetchTmdbCatalog(key, 'IN')
      if (!catalog.length) return
      sizesIn[`${key}:${inToday}`] = size
      const previous = await kv.get<CatalogSnapshot>(catalogKey(key, 'IN')).catch(() => null)

      const { added, left, confirmed, pendingLeft, arriveDate, departDate, pendingCount } = await diffCatalogs({
        catalog,
        previous,
        today: inToday,
        stillOn: (t) => stillOnProvider(t, key, 'IN'),
        verifyBudget: LEFT_VERIFY_BUDGET
      })
      added.sort(byPopularity)
      left.sort(byPopularity)

      const payload: ProviderChanges = {
        source: streamingProviders[key].title.replace(/ Movies$/, ''),
        updatedAt: Date.now(),
        added: added.slice(0, CHANGE_LIST_LIMIT),
        left: left.slice(0, CHANGE_LIST_LIMIT),
        coming: []
      }

      // Dated monthly accumulation backs the /in/ diff pages — same shape as
      // the US monthly minus the Watchmode-only coming/leavingSoon feeds.
      const prev = prevInMonthly.get(key)
      const arrived = new Map<number, ComingTitle>()
      for (const t of prev?.arrived || []) arrived.set(t.tmdbId, t)
      for (const t of added) {
        if (t.tmdbId && !arrived.has(t.tmdbId)) {
          arrived.set(t.tmdbId, { tmdbId: t.tmdbId, tmdbType: t.tmdbType, title: t.title, date: arriveDate.get(t.tmdbId) || inToday, season: null, popularity: t.popularity })
        }
      }
      const departed = new Map<number, DatedCatalogTitle>()
      for (const t of prev?.departed || []) if (t.tmdbId) departed.set(t.tmdbId, t)
      for (const t of added) if (t.tmdbId) departed.delete(t.tmdbId)
      for (const t of left) {
        if (t.tmdbId) {
          arrived.delete(t.tmdbId)
          departed.set(t.tmdbId, { ...t, date: departDate.get(t.tmdbId) || inToday })
        }
      }
      const monthly: MonthlyChanges = {
        source: payload.source,
        month: inMonth,
        updatedAt: Date.now(),
        arrived: [...arrived.values()].sort(byPopularity).slice(0, MONTHLY_LIST_LIMIT),
        coming: [],
        departed: [...departed.values()].sort(byPopularity).slice(0, MONTHLY_LIST_LIMIT)
      }
      monthliesForIndexIn.push([key, monthly])

      await kv.set(catalogKey(key, 'IN'), { titles: confirmed, updatedAt: Date.now(), src: SNAPSHOT_SRC, pendingLeft })
      await kv.set(changesKey(key, 'IN'), payload)
      await kv.set(monthlyKey(`IN:${key}`, inMonth), monthly, { ex: MONTHLY_TTL_SECONDS })
      await recordProviderMoves('IN', key, added, left, inToday, departDate)
      const yearField = `${key}:${inMonth}`
      const priorYear = await kv.hget<YearlyChanges>(yearHashKey('IN', inYear), yearField).catch(() => null)
      yearlyIn[yearField] = mergeYearlyDiff(priorYear, payload.source, inMonth, added, left, inToday)
      pushTitleUrls([...payload.added, ...payload.left])
      if (payload.added.length || payload.left.length) {
        indexNowUrls.add(`${SITE_URL}/in/streaming/${key}`)
        indexNowUrls.add(`${SITE_URL}/in/leaving/${key}`)
      }
      summary[`in:${key}`] = { added: added.length, left: left.length, coming: 0, catalog: confirmed.length, pending: pendingCount }
    } catch (error) {
      console.error(`in catalog update failed for ${key}:`, error)
    }
  })

  if (monthliesForIndexIn.length) {
    try {
      await kv.hset(titleIndexKey('IN'), buildTitleIndex(monthliesForIndexIn))
      await kv.expire(titleIndexKey('IN'), TITLE_INDEX_TTL_SECONDS)
    } catch (error) {
      console.error('IN title index write failed:', error)
    }
  }

  if (Object.keys(yearlyIn).length) {
    try {
      await kv.hset(yearHashKey('IN', inYear), yearlyIn)
      await kv.expire(yearHashKey('IN', inYear), YEAR_TTL_SECONDS)
    } catch (error) {
      console.error('IN year rollup write failed:', error)
    }
  }

  if (Object.keys(sizesIn).length) {
    try {
      await kv.hset(sizeHashKey('IN', inYear), sizesIn)
      await kv.expire(sizeHashKey('IN', inYear), YEAR_TTL_SECONDS)
    } catch (error) {
      console.error('IN size index write failed:', error)
    }
  }

  // Trending-week titles ride the "where to watch X" search spikes — ping them
  // daily so Bing indexes the hot set even on days with no provider diff hits.
  const [trendingMovies, trendingTv] = await Promise.all([
    fetchTmdb<TmdbPaged<TmdbMovie>>('/trending/movie/week', { page: 1 }).catch((): null => null),
    fetchTmdb<TmdbPaged<TmdbTvShow>>('/trending/tv/week', { page: 1 }).catch((): null => null)
  ])
  for (const t of trendingMovies?.results || []) {
    if (!t?.id) continue
    indexNowUrls.add(`${SITE_URL}/movies/${t.id}`)
    warmCandidates.push({ id: t.id, mediaType: 'movie', title: t.title, popularity: t.popularity })
  }
  for (const t of trendingTv?.results || []) {
    if (!t?.id) continue
    indexNowUrls.add(`${SITE_URL}/tv/${t.id}`)
    warmCandidates.push({ id: t.id, mediaType: 'tv', title: t.name, popularity: t.popularity })
  }

  // Release-day queries hit before competitors index the title — the Jailer 2
  // spike showed the payoff. Global popularity buries regional releases, so
  // US and IN each get their own slice: daily ping + warm so the page is
  // indexed and non-thin before the searches start.
  const upcomingRegions = await Promise.all(
    (['US', 'IN'] as const).map(region =>
      fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', {
        page: 1,
        include_adult: 'false',
        sort_by: 'popularity.desc',
        region,
        'release_date.gte': new Date().toISOString().split('T')[0],
        'vote_count.gte': 10
      }).catch((): null => null)
    )
  )
  // release_date on a discover result is the primary (earliest) date — for a
  // cross-region title that's already out elsewhere it lands ≤0, which reads
  // as "spiking now" in the warm sort. Right answer either way.
  const nowMs = Date.now()
  const daysUntilRelease = (date?: string) => {
    if (!date) return undefined
    const ms = new Date(date).getTime() - nowMs
    return Number.isFinite(ms) ? Math.ceil(ms / 86400000) : undefined
  }
  for (const t of upcomingRegions.flatMap(d => d?.results || [])) {
    // No overview = detail page noindexes — skip rather than warming a page
    // Google will refuse anyway.
    if (!t?.id || !t.overview) continue
    indexNowUrls.add(`${SITE_URL}/movies/${t.id}`)
    if (t.title) warmCandidates.push({ id: t.id, mediaType: 'movie', title: t.title, popularity: t.popularity, releasesWithinDays: daysUntilRelease(t.release_date) })
  }

  if (indexNowUrls.size) {
    indexNowUrls.add(`${SITE_URL}/new-on-streaming`)
    indexNowUrls.add(`${SITE_URL}/reports/streaming-churn`)
    await pingIndexNow([...indexNowUrls])
    // Same priority set feeds Bing's URL Submission API — its 90/day quota is
    // the only "request indexing" channel that exists, and idle quota is a
    // missed crawl.
    const bing = await submitDailyBatch([...indexNowUrls]).catch((err) => ({ submitted: 0, budget: 0, error: String(err) }))
    summary.bingSubmitted = bing.submitted
    if (bing.error) summary.bingSubmitError = bing.error
  }

  // Referer-less requests (the scraper fingerprint) can no longer trigger AI
  // generation in SSR — warm the surfaced set here so real users and crawlers
  // still see generated content on the pages that get search traffic.
  summary.aiWarm = await warmAiTitleCache(warmCandidates).catch(() => 'failed')

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

const CATALOG_MEMO_MS = 10 * 60 * 1000
const catalogMemo = new LRUCache<string, CatalogTitle[]>({ max: 64, ttl: CATALOG_MEMO_MS })

export async function getProviderCatalog(providerKey: string, region = 'US'): Promise<CatalogTitle[]> {
  const memoKey = `${region}:${providerKey}`
  const memoized = catalogMemo.get(memoKey)
  if (memoized) return memoized

  const kv = getRedis()
  let titles: CatalogTitle[] = []
  if (kv) {
    try {
      const snap = await kv.get<CatalogSnapshot>(catalogKey(providerKey, region))
      titles = snap?.titles || []
    } catch {}
  }
  catalogMemo.set(memoKey, titles)
  return titles
}

const monthlyMemo = new LRUCache<string, Record<string, MonthlyChanges>>({ max: 64, ttl: CHANGES_MEMO_MS })

export interface ChurnProviderRow {
  key: string
  label: string
  // 'YYYY-MM' -> movement that month
  months: Record<string, { arrived: number; departed: number; net: number }>
  totals: { arrived: number; departed: number; net: number }
}

// Year-hash fields are '{providerKey}:{YYYY-MM}' — provider keys carry no colon.
export function buildChurnRows(yearly: Record<string, YearlyChanges>): ChurnProviderRow[] {
  const rows = new Map<string, ChurnProviderRow>()
  for (const [field, y] of Object.entries(yearly)) {
    const sep = field.lastIndexOf(':')
    const key = field.slice(0, sep)
    const month = field.slice(sep + 1)
    if (!key || !/^\d{4}-\d{2}$/.test(month)) continue
    const row = rows.get(key) || { key, label: y.source || key, months: {}, totals: { arrived: 0, departed: 0, net: 0 } }
    const arrived = y.arrived?.length || 0
    const departed = y.departed?.length || 0
    row.months[month] = { arrived, departed, net: arrived - departed }
    row.totals.arrived += arrived
    row.totals.departed += departed
    row.totals.net += arrived - departed
    row.label = y.source || row.label
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => (b.totals.arrived + b.totals.departed) - (a.totals.arrived + a.totals.departed))
}

export interface CatalogSizePoint {
  m: number
  t: number
  date: string
}

// Latest tracked size per provider — fields are {provider}:{YYYY-MM-DD}.
export async function getCatalogSizes(region: 'US' | 'IN' = 'US', year?: string): Promise<Record<string, CatalogSizePoint>> {
  const kv = getRedis()
  if (!kv) return {}
  const y = year || new Date().toISOString().slice(0, 4)
  try {
    const hash = (await kv.hgetall<Record<string, { m: number; t: number }>>(sizeHashKey(region, y))) ?? {}
    const latest: Record<string, CatalogSizePoint> = {}
    for (const [field, size] of Object.entries(hash)) {
      const sep = field.lastIndexOf(':')
      const key = field.slice(0, sep)
      const date = field.slice(sep + 1)
      if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !size) continue
      if (!latest[key] || date > latest[key].date) latest[key] = { m: size.m || 0, t: size.t || 0, date }
    }
    return latest
  } catch {
    return {}
  }
}

// One HGETALL backs the whole churn report — ~providers×months fields.
export async function getYearlyChanges(region: 'US' | 'IN' = 'US', year?: string): Promise<Record<string, YearlyChanges>> {
  const kv = getRedis()
  if (!kv) return {}
  const y = year || new Date().toISOString().slice(0, 4)
  try {
    return (await kv.hgetall<Record<string, YearlyChanges>>(yearHashKey(region, y))) ?? {}
  } catch {
    return {}
  }
}

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
