import { createHmac, timingSafeEqual } from 'crypto'
import type { MediaType } from '../types/tmdb'

const TRAKT_API = 'https://api.trakt.tv'

export interface TraktTokens {
  access_token: string
  refresh_token: string
  expires_in?: number
  created_at?: number
}

export function traktConfigured(): boolean {
  return Boolean(process.env.TRAKT_CLIENT_ID && process.env.TRAKT_CLIENT_SECRET)
}

// state = base64url(email.key).hmac — stateless CSRF proof carrying the sync
// credentials so the callback doesn't need a server-side nonce store.
export function signState(email: string, key: string): string {
  const payload = Buffer.from(JSON.stringify({ email, key })).toString('base64url')
  const sig = createHmac('sha256', process.env.TRAKT_CLIENT_SECRET!).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyState(state: string): { email: string; key: string } | null {
  const secret = process.env.TRAKT_CLIENT_SECRET
  if (!secret) return null
  const dot = state.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = state.slice(0, dot)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(state.slice(dot + 1))
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof parsed?.email === 'string' && typeof parsed?.key === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TRAKT_CLIENT_ID!,
    redirect_uri: redirectUri,
    state
  })
  return `https://trakt.tv/oauth/authorize?${params}`
}

async function tokenRequest(body: Record<string, string>): Promise<TraktTokens | null> {
  const resp = await fetch(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      ...body
    })
  }).catch(() => null)
  if (!resp?.ok) return null
  return resp.json().catch(() => null)
}

export function exchangeCode(code: string, redirectUri: string): Promise<TraktTokens | null> {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
}

export function refreshTokens(refreshToken: string, redirectUri: string): Promise<TraktTokens | null> {
  return tokenRequest({ refresh_token: refreshToken, redirect_uri: redirectUri, grant_type: 'refresh_token' })
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
