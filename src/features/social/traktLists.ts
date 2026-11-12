import { getRedis } from '../../lib/redis'
import { refreshTokens, TRAKT_API, TRAKT_UA } from '../billing/trakt'
import { BROADCAST_PROVIDERS, providerLabel } from './socialBroadcast'
import {
  getMonthlyChanges,
  getProviderChanges,
  type CatalogTitle,
  type DatedCatalogTitle,
  type LeavingSoonTitle
} from '../catalog/streamingChanges'
import type { MediaType } from '../../types/tmdb'

// Brand-account creds: env var is the bootstrap/recovery path, the rotated
// refresh token persists here since Trakt rotates on every refresh.
const BRAND_KEY = 'gm:trakt:brand'
const OOB_REDIRECT = 'urn:ietf:wg:oauth:2.0:oob'
const LIST_CAP = 50

interface BrandCreds {
  refreshToken: string
  redirectUri: string
}

type ListableTitle = Pick<CatalogTitle, 'tmdbId' | 'tmdbType' | 'popularity'>

export async function brandAccessToken(): Promise<{ token: string } | { error: 'not_configured' | 'unavailable' }> {
  if (!process.env.TRAKT_CLIENT_ID) return { error: 'not_configured' }
  const kv = getRedis()
  const stored = kv ? await kv.hget<BrandCreds>(BRAND_KEY, 'creds').catch(() => null) : null
  const refreshToken = stored?.refreshToken || process.env.TRAKT_BRAND_REFRESH_TOKEN
  if (!refreshToken) return { error: 'not_configured' }
  const redirectUri = stored?.redirectUri || process.env.TRAKT_REDIRECT_URI || OOB_REDIRECT

  const tokens = await refreshTokens(refreshToken, redirectUri)
  if (!tokens?.access_token || !tokens.refresh_token) return { error: 'unavailable' }
  if (kv && tokens.refresh_token !== refreshToken) {
    await kv.hset(BRAND_KEY, { creds: { refreshToken: tokens.refresh_token, redirectUri } }).catch(() => undefined)
  }
  return { token: tokens.access_token }
}

async function traktFetch(token: string, path: string, init: { method?: string; body?: object } = {}) {
  const resp = await fetch(`${TRAKT_API}/${path}`, {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': TRAKT_UA,
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID!,
      Authorization: `Bearer ${token}`
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  }).catch((err) => {
    console.error(`Trakt ${init.method || 'GET'} ${path} threw:`, err)
    return null
  })
  if (resp && !resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`Trakt ${init.method || 'GET'} ${path}:`, resp.status, body.slice(0, 300))
  }
  return resp
}

interface TraktList {
  name?: string
  ids?: { slug?: string }
}

// Slugs are matched by name, not derived — provider keys like `disney-plus`
// don't survive Trakt's slugifier ("New on Disney+ this week" loses the +).
export async function ensureList(
  token: string,
  user: string,
  known: Map<string, string>,
  name: string,
  description: string
): Promise<string | null> {
  const existing = known.get(name)
  if (existing) return existing
  const created = await traktFetch(token, `users/${user}/lists`, {
    method: 'POST',
    body: { name, description, privacy: 'public' }
  })
  const list = created?.ok ? ((await created.json().catch(() => null)) as TraktList | null) : null
  const slug = list?.ids?.slug
  if (!slug) return null
  known.set(name, slug)
  return slug
}

async function listSlugs(token: string, user: string): Promise<Map<string, string> | null> {
  const resp = await traktFetch(token, `users/${user}/lists`)
  if (!resp?.ok) return null
  const lists = (await resp.json().catch(() => [])) as TraktList[]
  const map = new Map<string, string>()
  for (const l of lists) if (l.name && l.ids?.slug) map.set(l.name, l.ids.slug)
  return map
}

const toTraktItems = (titles: ListableTitle[]) => {
  const body = { movies: [] as { ids: { tmdb: number } }[], shows: [] as { ids: { tmdb: number } }[] }
  for (const t of titles) {
    if (typeof t.tmdbId !== 'number') continue
    ;(t.tmdbType === 'tv' ? body.shows : body.movies).push({ ids: { tmdb: t.tmdbId } })
  }
  return body
}

interface TraktListEntry {
  type?: string
  movie?: { ids?: { tmdb?: number } }
  show?: { ids?: { tmdb?: number } }
}

// Adds only append in Trakt, so sync = remove whatever's listed, then add the
// desired set. Keeps reruns idempotent without diffing.
export async function replaceItems(token: string, user: string, slug: string, titles: ListableTitle[]): Promise<boolean> {
  const current = await traktFetch(token, `users/${user}/lists/${slug}/items`)
  if (!current?.ok) return false
  const entries = (await current.json().catch(() => [])) as TraktListEntry[]
  const existing = entries
    .map((e): ListableTitle | null => {
      const tmdbId = e.movie?.ids?.tmdb ?? e.show?.ids?.tmdb
      return typeof tmdbId === 'number' ? { tmdbId, tmdbType: (e.type === 'show' ? 'tv' : 'movie') as MediaType } : null
    })
    .filter((e): e is ListableTitle => Boolean(e))

  const remove = toTraktItems(existing)
  if (remove.movies.length || remove.shows.length) {
    const r = await traktFetch(token, `users/${user}/lists/${slug}/items/remove`, { method: 'POST', body: remove })
    if (!r?.ok) return false
  }

  const add = toTraktItems(titles)
  if (!add.movies.length && !add.shows.length) return true
  const a = await traktFetch(token, `users/${user}/lists/${slug}/items`, { method: 'POST', body: add })
  return Boolean(a?.ok)
}

const pickTop = <T extends ListableTitle>(titles: T[]): T[] =>
  [...titles].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, LIST_CAP)

const dedupe = <T extends ListableTitle>(titles: T[]): T[] => {
  const seen = new Set<string>()
  return titles.filter((t) => {
    const key = `${t.tmdbType}:${t.tmdbId}`
    if (typeof t.tmdbId !== 'number' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface TraktListsSummary {
  updated: string[]
  skipped: string[]
  error?: string
}

export async function maintainTraktLists(): Promise<TraktListsSummary> {
  const auth = await brandAccessToken()
  if ('error' in auth) {
    return {
      updated: [],
      skipped: [],
      error: auth.error === 'not_configured' ? 'TRAKT_BRAND_REFRESH_TOKEN not configured' : 'Trakt token refresh failed'
    }
  }
  const user = process.env.TRAKT_BRAND_USERNAME || 'me'
  const known = await listSlugs(auth.token, user)
  if (!known) return { updated: [], skipped: [], error: 'Could not read brand lists' }

  const summary: TraktListsSummary = { updated: [], skipped: [] }
  const changes = await getProviderChanges(BROADCAST_PROVIDERS)
  const desc = `Auto-updated from Galaxy Movies — https://www.galaxymovies.app/leaving`

  // Free-tier accounts cap at 5 lists — the merged departures list is the
  // signature content, so it claims a slot before per-provider lists do.
  const monthly = await getMonthlyChanges(BROADCAST_PROVIDERS)
  const departures: (DatedCatalogTitle | LeavingSoonTitle)[] = []
  for (const key of BROADCAST_PROVIDERS) {
    departures.push(...(monthly[key]?.departed || []), ...(monthly[key]?.leavingSoon || []))
  }
  const leavingName = `Leaving Soon ${new Date().toISOString().slice(0, 7)}`
  const items = pickTop(dedupe(departures))
  if (!items.length) {
    summary.skipped.push(leavingName)
  } else {
    const slug = await ensureList(auth.token, user, known, leavingName, desc)
    if (slug && (await replaceItems(auth.token, user, slug, items))) summary.updated.push(leavingName)
    else summary.skipped.push(leavingName)
  }

  for (const key of BROADCAST_PROVIDERS) {
    const name = `New on ${providerLabel(key)} this week`
    const added = pickTop(changes[key]?.added || [])
    if (!added.length) {
      summary.skipped.push(name)
      continue
    }
    const slug = await ensureList(auth.token, user, known, name, desc)
    if (slug && (await replaceItems(auth.token, user, slug, added))) summary.updated.push(name)
    else summary.skipped.push(name)
  }

  return summary
}
