import { LRUCache } from 'lru-cache'
import { fetchTmdb, getProviderIds, streamingProviders } from './tmdb'
import { getTitleChanges } from './streamingChanges'
import { providerLabel } from './embed'
import { SITE_URL } from '../../lib/site'
import type { MediaType, WatchProvidersResponse } from '../../types/tmdb'

export interface WhereQuery {
  id?: number
  type?: MediaType
  imdbId?: string
  title?: string
  year?: string
  region: string
}

export interface WhereProvider {
  id: number
  name: string
  leavingOn?: string
}

export interface WhereEvent {
  key: string
  provider: string
  date?: string
}

export interface WhereResult {
  tmdbId: number
  tmdbType: MediaType
  title: string
  year: number | null
  region: string
  providers: {
    flatrate: WhereProvider[]
    free: WhereProvider[]
    ads: WhereProvider[]
    rent: WhereProvider[]
    buy: WhereProvider[]
  }
  events?: {
    coming?: WhereEvent[]
    leaving?: WhereEvent[]
  }
  url: string
}

// Cache-absorbing layer for the public /api/ext/where endpoint: popular titles
// get hammered by extension/bot callers, and both hits and misses are stored so
// junk queries can't fan out to TMDB either. The route checks this LRU before
// spending rate-limit checks, mirroring watchProviders.ts.
export const whereResultCache = new LRUCache<string, { v: WhereResult | null }>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24
})

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function whereCacheKey(q: WhereQuery): string {
  const lookup = q.id ? `id:${q.id}` : q.imdbId ? `imdb:${q.imdbId}` : `t:${normalize(q.title || '')}:${q.year || ''}`
  return `${q.region}|${q.type || 'any'}|${lookup}`
}

interface SearchItem {
  id?: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
}

interface FindResponse {
  movie_results?: SearchItem[]
  tv_results?: SearchItem[]
}

const itemTitle = (i: SearchItem) => i.title || i.name || ''
const itemYear = (i: SearchItem) => (i.release_date || i.first_air_date || '').slice(0, 4)

async function resolveTitle(q: WhereQuery): Promise<{ id: number; type: MediaType; title: string; year: number | null } | null> {
  if (q.id && q.type) {
    const d = await fetchTmdb<SearchItem>(`/${q.type}/${q.id}`)
    if (typeof d?.id !== 'number' || !itemTitle(d)) return null
    return { id: d.id, type: q.type, title: itemTitle(d), year: itemYear(d) ? Number(itemYear(d)) : null }
  }

  if (q.imdbId) {
    const d = await fetchTmdb<FindResponse>(`/find/${q.imdbId}`, { external_source: 'imdb_id' })
    const item = d.movie_results?.[0]
      ? { ...d.movie_results[0], media_type: 'movie' as const }
      : d.tv_results?.[0]
        ? { ...d.tv_results[0], media_type: 'tv' as const }
        : null
    if (typeof item?.id !== 'number' || !itemTitle(item)) return null
    return { id: item.id, type: item.media_type, title: itemTitle(item), year: itemYear(item) ? Number(itemYear(item)) : null }
  }

  const path = q.type ? `/search/${q.type}` : '/search/multi'
  const d = await fetchTmdb<{ results?: SearchItem[] }>(path, { query: q.title, include_adult: false })
  const items = (d.results || []).filter((i) =>
    typeof i.id === 'number' && itemTitle(i) && (q.type ? true : i.media_type === 'movie' || i.media_type === 'tv')
  )
  if (!items.length) return null
  const want = normalize(q.title || '')
  const yearMatch = (i: SearchItem) => Boolean(q.year) && itemYear(i) === q.year
  const same = items.filter((i) =>
    [i.title, i.name, i.original_title, i.original_name].some((t) => t !== undefined && normalize(t) === want)
  )
  const best = same.find(yearMatch) || same[0] || items.find(yearMatch) || items[0]
  const type = (q.type || best.media_type) as MediaType
  return { id: best.id!, type, title: itemTitle(best), year: itemYear(best) ? Number(itemYear(best)) : null }
}

const toWhereProviders = (
  list: { provider_id: number; provider_name: string }[] | undefined,
  leavingIds: Map<number, string>
): WhereProvider[] =>
  (list || []).map((p) => {
    const leavingOn = leavingIds.get(p.provider_id)
    return leavingOn ? { id: p.provider_id, name: p.provider_name, leavingOn } : { id: p.provider_id, name: p.provider_name }
  })

// Dated events from our diff index — the "leaves X on Friday" signal no
// provider listing carries. Providers are annotated by TMDB id so clients can
// match without fuzzy name comparison; `coming`/`leaving` also go out raw.
const toWhereEvents = (
  list: { p: string; date?: string }[] | undefined
): WhereEvent[] | undefined =>
  list?.length
    ? list.filter((e) => streamingProviders[e.p]).map((e) => ({ key: e.p, provider: providerLabel(e.p), date: e.date }))
    : undefined

// Resolves a title to its watch providers. Returns null when the title can't
// be resolved or TMDB has no provider data for the region — callers 404 on it.
// No cache/rate-limit here: the route wraps this with the LRU above, in-process
// callers (Discord/Slack) should use lookupWhere() instead.
export async function resolveWhere(q: WhereQuery): Promise<WhereResult | null> {
  try {
    const resolved = await resolveTitle(q)
    if (!resolved) return null

    const data = await fetchTmdb<WatchProvidersResponse>(`/${resolved.type}/${resolved.id}/watch/providers`)
    const entry = data.results?.[q.region]
    if (!entry) return null

    const changes = await getTitleChanges(resolved.type, resolved.id, q.region)
    const leavingIds = new Map<number, string>()
    for (const e of changes?.leaving || []) {
      if (!e.date) continue
      for (const id of getProviderIds(e.p, q.region)) leavingIds.set(id, e.date)
    }
    const coming = toWhereEvents(changes?.coming)
    const leaving = toWhereEvents(changes?.leaving)

    return {
      tmdbId: resolved.id,
      tmdbType: resolved.type,
      title: resolved.title,
      year: resolved.year,
      region: q.region,
      providers: {
        flatrate: toWhereProviders(entry.flatrate, leavingIds),
        free: toWhereProviders(entry.free, leavingIds),
        ads: toWhereProviders(entry.ads, leavingIds),
        rent: toWhereProviders(entry.rent, leavingIds),
        buy: toWhereProviders(entry.buy, leavingIds)
      },
      ...(coming || leaving ? { events: { ...(coming ? { coming } : {}), ...(leaving ? { leaving } : {}) } } : {}),
      url: `${SITE_URL}/${resolved.type === 'tv' ? 'tv' : 'movies'}/${resolved.id}`
    }
  } catch {
    return null
  }
}

// Cache-aware variant for in-process callers (Discord/Slack commands) — they
// rate-limit on guild/team ids, not this LRU.
export async function lookupWhere(q: WhereQuery): Promise<WhereResult | null> {
  const key = whereCacheKey(q)
  const hit = whereResultCache.get(key)
  if (hit !== undefined) return hit.v
  const result = await resolveWhere(q)
  whereResultCache.set(key, { v: result })
  return result
}
