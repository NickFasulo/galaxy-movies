import { getRedis } from './redis'
import { checkGlobalBudget } from './rateLimiter'
import type { MediaType } from '../types/tmdb'

const WATCHMODE_BASE = 'https://api.watchmode.com/v1'
const WM_ID_TTL_SECONDS = 60 * 60 * 24 * 7
// Hard daily cap on uncached title lookups: Watchmode quota is monthly, so rotating-IP
// scraping of /api/prices must not be able to exhaust it.
const DAILY_UPSTREAM_LOOKUP_BUDGET = Number(process.env.WATCHMODE_DAILY_LOOKUP_BUDGET) || 300
const SEARCH_FIELD: Record<MediaType, string> = { movie: 'tmdb_movie_id', tv: 'tmdb_tv_id' }

// Watchmode free tier only serves US sources — skip upstream calls elsewhere.
const WATCHMODE_REGIONS = ['US']

// Store-name keywords shared between Watchmode/iTunes offer names and TMDB
// provider_name values so offers can be attached to the right icon.
const PROVIDER_GROUPS = [
  /apple|itunes/i,
  /amazon|prime|instant/i,
  /google|youtube/i,
  /vudu|fandango/i,
  /microsoft|xbox/i,
  /spectrum/i,
  /amc/i
]

interface WatchmodeSource {
  name: string
  type: string
  format?: string | null
  price?: number | null
  web_url?: string | null
  seasons?: number | null
}

interface WatchmodeDetails {
  critic_score?: number | null
  user_rating?: number | null
  relevance_percentile?: number | null
}

export interface PriceOffer {
  provider: string
  store: string
  type: string
  format: string | null
  price: number | null
  currency: string
  url: string | null
  seasons: number | null
}

export interface PriceExtras {
  criticScore: number | null
  userRating: number | null
  relevancePercentile: number | null
}

export interface PricePayload {
  cacheKey?: string
  region: string
  fetchedAt: number
  offers: PriceOffer[]
  cheapest: { rent: PriceOffer | null; buy: PriceOffer | null }
  extras: PriceExtras
}

export function sameStore(a = '', b = ''): boolean {
  return PROVIDER_GROUPS.some((re) => re.test(a) && re.test(b))
}

async function resolveWatchmodeId(tmdbId: string | number, mediaType: MediaType): Promise<number | null> {
  const apiKey = process.env.WATCHMODE_API_KEY
  if (!apiKey) return null

  const cacheKey = `wm:id:${mediaType}:${tmdbId}`
  const kv = getRedis()
  if (kv) {
    try {
      const cached = await kv.get<number | 'none'>(cacheKey)
      if (cached) return cached === 'none' ? null : cached
    } catch {}
  }

  try {
    const url = `${WATCHMODE_BASE}/search/?search_field=${SEARCH_FIELD[mediaType] || SEARCH_FIELD.movie}&search_value=${tmdbId}`
    const resp = await fetch(url, { headers: { 'X-API-Key': apiKey } })
    if (!resp.ok) return null
    const data: { title_results?: { id: number }[] } = await resp.json()
    const wmId = data.title_results?.[0]?.id || null
    if (kv) {
      try {
        await kv.set(cacheKey, wmId || 'none', { ex: WM_ID_TTL_SECONDS })
      } catch {}
    }
    return wmId
  } catch {
    return null
  }
}

async function fetchWatchmodeJson<T>(path: string): Promise<T | null> {
  const apiKey = process.env.WATCHMODE_API_KEY
  if (!apiKey) return null
  try {
    const resp = await fetch(`${WATCHMODE_BASE}${path}`, { headers: { 'X-API-Key': apiKey } })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

const isPaidOffer = (s: WatchmodeSource) => (s.type === 'rent' || s.type === 'buy') && s.price != null

function toWatchmodeOffers(sources: WatchmodeSource[] = []): PriceOffer[] {
  return sources
    .filter((s) => isPaidOffer(s) || s.type === 'sub' || s.type === 'free')
    .map((s) => ({
      provider: s.name,
      store: 'watchmode',
      type: s.type,
      format: s.format || null,
      price: s.price ?? null,
      currency: 'USD',
      url: s.web_url || null,
      seasons: s.seasons ?? null
    }))
}

function dedupeOffers(offers: PriceOffer[]): PriceOffer[] {
  const seen = new Map<string, PriceOffer>()
  for (const offer of offers) {
    const key = `${offer.provider}|${offer.type}|${offer.format}`
    const existing = seen.get(key)
    if (!existing || (offer.price != null && (existing.price == null || offer.price < existing.price))) {
      seen.set(key, offer)
    }
  }
  return [...seen.values()]
}

const cheapestOf = (offers: PriceOffer[], type: string): PriceOffer | null =>
  offers
    .filter((o) => o.type === type && o.price != null)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] || null

export async function getPriceOffers({ tmdbId, mediaType = 'movie', region = 'US' }: {
  tmdbId: string | number
  mediaType?: MediaType
  region?: string
}): Promise<PricePayload> {
  const withinBudget = WATCHMODE_REGIONS.includes(region) && await checkGlobalBudget('watchmode', {
    maxRequests: DAILY_UPSTREAM_LOOKUP_BUDGET,
    windowSeconds: 60 * 60 * 24
  })
  const wmId = withinBudget ? await resolveWatchmodeId(tmdbId, mediaType) : null

  const [sources, details] = await Promise.all([
    wmId ? fetchWatchmodeJson<WatchmodeSource[]>(`/title/${wmId}/sources/?regions=${region}`) : null,
    wmId ? fetchWatchmodeJson<WatchmodeDetails>(`/title/${wmId}/details`) : null
  ])

  const offers = dedupeOffers(sources ? toWatchmodeOffers(sources) : [])

  return {
    region,
    fetchedAt: Date.now(),
    offers,
    cheapest: { rent: cheapestOf(offers, 'rent'), buy: cheapestOf(offers, 'buy') },
    extras: details
      ? {
          criticScore: details.critic_score ?? null,
          userRating: details.user_rating ?? null,
          relevancePercentile: details.relevance_percentile ?? null
        }
      : { criticScore: null, userRating: null, relevancePercentile: null }
  }
}
