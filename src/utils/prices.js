import { getRedis } from './redis'

const WATCHMODE_BASE = 'https://api.watchmode.com/v1'
const ITUNES_BASE = 'https://itunes.apple.com'
const WM_ID_TTL_SECONDS = 60 * 60 * 24 * 7
const SEARCH_TYPE = { movie: 1, tv: 2 }

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

export function sameStore(a = '', b = '') {
  return PROVIDER_GROUPS.some((re) => re.test(a) && re.test(b))
}

const normalizeTitle = (value = '') =>
  value
    .toLowerCase()
    .replace(/\(\d{4}\)/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

async function resolveWatchmodeId(tmdbId, mediaType) {
  const apiKey = process.env.WATCHMODE_API_KEY
  if (!apiKey) return null

  const cacheKey = `wm:id:${mediaType}:${tmdbId}`
  const kv = getRedis()
  if (kv) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) return cached === 'none' ? null : cached
    } catch {}
  }

  try {
    const url = `${WATCHMODE_BASE}/search/?search_field=tmdb_id&search_value=${tmdbId}&search_type=${SEARCH_TYPE[mediaType] || 1}`
    const resp = await fetch(url, { headers: { 'X-API-Key': apiKey } })
    if (!resp.ok) return null
    const data = await resp.json()
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

async function fetchWatchmodeJson(path) {
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

const isPaidOffer = (s) => (s.type === 'rent' || s.type === 'buy') && s.price != null

function toWatchmodeOffers(sources = []) {
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

function pickItunesMatch(results, title, year, kind) {
  const want = normalizeTitle(title)
  const candidates = results.filter((r) => (kind ? r.kind === kind : true))
  for (const result of candidates) {
    const resultTitle = normalizeTitle(result.trackName || result.collectionName)
    if (resultTitle !== want && !resultTitle.startsWith(want)) continue
    if (year) {
      const resultYear = Number((result.releaseDate || '').slice(0, 4))
      if (resultYear && Math.abs(resultYear - year) > 1) continue
    }
    return result
  }
  return null
}

async function fetchItunesMovieOffers(title, year, region) {
  const url = `${ITUNES_BASE}/search?term=${encodeURIComponent(title)}&media=movie&entity=movie&country=${region}&limit=5`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  const match = pickItunesMatch(data.results || [], title, year, 'feature-movie')
  if (!match) return []

  const offers = []
  const push = (type, format, price) => {
    if (price != null) {
      offers.push({ provider: 'Apple TV', store: 'itunes', type, format, price, currency: match.currency || 'USD', url: match.trackViewUrl })
    }
  }
  push('rent', 'SD', match.trackRentalPrice)
  push('rent', 'HD', match.trackHdRentalPrice)
  push('buy', 'SD', match.trackPrice)
  push('buy', 'HD', match.trackHdPrice)
  return offers
}

async function fetchItunesTvOffers(title, year, region) {
  const url = `${ITUNES_BASE}/search?term=${encodeURIComponent(title)}&media=tvShow&entity=tvSeason&country=${region}&limit=5`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  const match = pickItunesMatch(data.results || [], title, year)
  if (!match?.collectionPrice) return []

  return [{
    provider: 'Apple TV (season)',
    store: 'itunes',
    type: 'buy',
    format: 'HD',
    price: match.collectionPrice,
    currency: match.currency || 'USD',
    url: match.collectionViewUrl || match.trackViewUrl
  }]
}

function dedupeOffers(offers) {
  const seen = new Map()
  for (const offer of offers) {
    const key = `${offer.provider}|${offer.type}|${offer.format}`
    const existing = seen.get(key)
    if (!existing || (offer.price != null && (existing.price == null || offer.price < existing.price))) {
      seen.set(key, offer)
    }
  }
  return [...seen.values()]
}

const cheapestOf = (offers, type) =>
  offers
    .filter((o) => o.type === type && o.price != null)
    .sort((a, b) => a.price - b.price)[0] || null

export async function getPriceOffers({ tmdbId, mediaType = 'movie', title, year, region = 'US' }) {
  const wmId = WATCHMODE_REGIONS.includes(region)
    ? await resolveWatchmodeId(tmdbId, mediaType)
    : null

  const [sources, details, itunesOffers] = await Promise.all([
    wmId ? fetchWatchmodeJson(`/title/${wmId}/sources/?regions=${region}`) : null,
    wmId ? fetchWatchmodeJson(`/title/${wmId}/details`) : null,
    title
      ? (mediaType === 'tv' ? fetchItunesTvOffers(title, year, region) : fetchItunesMovieOffers(title, year, region)).catch(() => [])
      : Promise.resolve([])
  ])

  const offers = dedupeOffers([...(sources ? toWatchmodeOffers(sources) : []), ...itunesOffers])

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
