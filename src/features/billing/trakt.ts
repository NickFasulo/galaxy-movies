import { createHash, randomBytes } from 'crypto'
import { getRedis, TRAKT_KEY } from '../alerts/waitlistStore'
import type { MediaType } from '../../types/tmdb'

const TRAKT_API = 'https://api.trakt.tv'
// New Trakt apps are PKCE-only (no client secret) and logins must move off
// trakt.tv/api.trakt.tv to auth.trakt.tv by Feb 2027.
const TRAKT_AUTH = 'https://auth.trakt.tv'
// api.trakt.tv sits behind Cloudflare bot rules that 403 the bare node/undici
// fetch UA — every server call needs an explicit app UA to reach the API.
const TRAKT_UA = 'Galaxy Movies (+https://www.galaxymovies.app)'
export const TRAKT_PKCE_PREFIX = 'gm:alerts:trakt:pkce:'
const PKCE_TTL_SECONDS = 600

export interface TraktTokens {
  access_token: string
  refresh_token: string
  expires_in?: number
  created_at?: number
}

export function traktConfigured(): boolean {
  return Boolean(process.env.TRAKT_CLIENT_ID)
}

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

interface PkceSession {
  email: string
  key: string
  verifier: string
}

// state is a random nonce whose Redis value carries the sync creds + PKCE
// verifier — single-use, 10-minute TTL. Replaces the old HMAC-signed state:
// with no client secret there's nothing to sign with, and keeping the
// verifier out of URLs is what makes PKCE work.
export async function createPkceSession(email: string, key: string): Promise<{ state: string; challenge: string } | null> {
  const kv = getRedis()
  if (!kv) return null
  const { verifier, challenge } = generatePkcePair()
  const state = randomBytes(16).toString('base64url')
  await kv.set(`${TRAKT_PKCE_PREFIX}${state}`, { email, key, verifier } satisfies PkceSession, { ex: PKCE_TTL_SECONDS })
  return { state, challenge }
}

export async function consumePkceSession(state: string): Promise<PkceSession | null> {
  const kv = getRedis()
  if (!kv || !state) return null
  const key = `${TRAKT_PKCE_PREFIX}${state}`
  const session = await kv.get<PkceSession>(key)
  await kv.del(key)
  if (typeof session?.email !== 'string' || typeof session?.key !== 'string' || typeof session?.verifier !== 'string') return null
  return session
}

export function authorizeUrl(redirectUri: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TRAKT_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })
  return `${TRAKT_AUTH}/oauth/authorize?${params}`
}

async function tokenRequest(body: Record<string, string>): Promise<TraktTokens | null> {
  const resp = await fetch(`${TRAKT_AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': TRAKT_UA },
    body: JSON.stringify({
      client_id: process.env.TRAKT_CLIENT_ID,
      ...body
    })
  }).catch((err) => {
    console.error('Trakt token request threw:', err)
    return null
  })
  if (!resp) return null
  if (!resp.ok) {
    console.error('Trakt token request failed:', resp.status, await resp.text().catch(() => '<unreadable>'))
    return null
  }
  return resp.json().catch(() => null)
}

export function exchangeCode(code: string, redirectUri: string, verifier: string): Promise<TraktTokens | null> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier })
}

export function refreshTokens(refreshToken: string, redirectUri: string): Promise<TraktTokens | null> {
  return tokenRequest({ refresh_token: refreshToken, redirect_uri: redirectUri, grant_type: 'refresh_token' })
}

// Revoking the access token drops the whole grant on Trakt's side — without
// this, disconnect only forgets our refresh token and a re-connect is silently
// auto-approved instead of showing the authorize page.
export async function revokeAccessToken(accessToken: string): Promise<boolean> {
  const resp = await fetch(`${TRAKT_AUTH}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': TRAKT_UA },
    body: JSON.stringify({ token: accessToken, client_id: process.env.TRAKT_CLIENT_ID })
  }).catch(() => null)
  return Boolean(resp?.ok)
}

// Shared by sync and import: a denied refresh means the grant is dead — the
// stored link is dropped so the client shows "connect" again.
export async function traktAccessToken(
  email: string,
  redirectUri: string
): Promise<{ token: string } | { error: 'not_connected' | 'unavailable' }> {
  const kv = getRedis()
  if (!kv) return { error: 'unavailable' }
  const link = await kv.hget<{ refreshToken?: string }>(TRAKT_KEY, email)
  if (!link?.refreshToken) return { error: 'not_connected' }
  const tokens = await refreshTokens(link.refreshToken, redirectUri)
  if (!tokens?.access_token || !tokens.refresh_token) {
    await kv.hdel(TRAKT_KEY, email)
    return { error: 'not_connected' }
  }
  await kv.hset(TRAKT_KEY, { [email]: { refreshToken: tokens.refresh_token } })
  return { token: tokens.access_token }
}

interface SyncItem {
  id: number
  mediaType?: MediaType
}

interface SyncRating extends SyncItem {
  rating: number
}

const toTraktBody = <T extends SyncItem>(items: T[], map: (item: T) => object) => {
  const body = { movies: [] as object[], shows: [] as object[] }
  for (const item of items) (item.mediaType === 'tv' ? body.shows : body.movies).push(map(item))
  return body
}

async function postSync(accessToken: string, path: string, body: object): Promise<boolean> {
  const resp = await fetch(`${TRAKT_API}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': TRAKT_UA,
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  }).catch(() => null)
  return Boolean(resp?.ok)
}

export async function syncToTrakt(
  accessToken: string,
  prefs: { watchlist?: SyncItem[]; ratings?: SyncRating[] }
): Promise<boolean> {
  const watchlist = toTraktBody(prefs.watchlist || [], (i) => ({ ids: { tmdb: i.id } }))
  if (!await postSync(accessToken, 'sync/watchlist', watchlist)) return false

  const ratings = prefs.ratings || []
  if (ratings.length) {
    const body = toTraktBody(ratings, (r) => ({ rating: r.rating, ids: { tmdb: r.id } }))
    if (!await postSync(accessToken, 'sync/ratings', body)) return false
  }
  return true
}

interface TraktSyncEntry {
  rating?: number
  movie?: { title?: string; year?: number | null; ids?: { tmdb?: number | null } }
  show?: { title?: string; year?: number | null; ids?: { tmdb?: number | null } }
}

export interface TraktPullItem {
  id: number
  mediaType: MediaType
  title: string
  year: string | null
}

export interface TraktPull {
  watchlist: TraktPullItem[]
  ratings: (TraktPullItem & { rating: number })[]
}

async function getSync(accessToken: string, path: string): Promise<TraktSyncEntry[] | null> {
  const resp = await fetch(`${TRAKT_API}/${path}`, {
    headers: {
      'User-Agent': TRAKT_UA,
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`
    }
  }).catch(() => null)
  if (!resp?.ok) return null
  return resp.json().catch(() => null)
}

const pullItem = (entry: TraktSyncEntry, mediaType: MediaType): TraktPullItem | null => {
  const t = mediaType === 'tv' ? entry.show : entry.movie
  if (typeof t?.ids?.tmdb !== 'number' || !t.title) return null
  return { id: t.ids.tmdb, mediaType, title: t.title, year: t.year != null ? String(t.year) : null }
}

export async function pullFromTrakt(accessToken: string): Promise<TraktPull | null> {
  const [wlMovies, wlShows, rMovies, rShows] = await Promise.all([
    getSync(accessToken, 'sync/watchlist/movies'),
    getSync(accessToken, 'sync/watchlist/shows'),
    getSync(accessToken, 'sync/ratings/movies'),
    getSync(accessToken, 'sync/ratings/shows')
  ])
  if (!wlMovies || !wlShows || !rMovies || !rShows) return null

  const watchlist = [...wlMovies.map((e) => pullItem(e, 'movie')), ...wlShows.map((e) => pullItem(e, 'tv'))].filter(
    (i): i is TraktPullItem => Boolean(i)
  )
  const ratings = [...rMovies.map((e) => ({ item: pullItem(e, 'movie'), e })), ...rShows.map((e) => ({ item: pullItem(e, 'tv'), e }))]
    .filter((r): r is { item: TraktPullItem; e: TraktSyncEntry } => Boolean(r.item) && typeof r.e.rating === 'number')
    .map((r) => ({ ...r.item, rating: Math.min(10, Math.max(1, Math.round(r.e.rating!))) }))
  return { watchlist, ratings }
}
