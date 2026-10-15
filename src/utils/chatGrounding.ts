import { LRUCache } from 'lru-cache'
import { fetchTmdb } from './tmdb'
import { getProviderChanges } from './streamingChanges'
import { extractTitleMentions, resolveMovieMentions, searchMultiByQuery } from './movieSearch'
import type { MediaType, WatchProvidersResponse } from '../types/tmdb'

// Provider names users actually type; drives both the availability-intent
// pattern and the question-phrase stripper for the fallback title search.
const PROVIDER_WORDS = [
  'netflix', 'hulu', 'max', 'disney+', 'disney', 'prime video', 'prime', 'amazon',
  'apple tv', 'apple', 'peacock', 'paramount+', 'paramount', 'tubi', 'pluto tv',
  'pluto', 'freevee', 'roku', 'crunchyroll', 'jiohotstar', 'zee5', 'sonyliv',
  'mubi', 'britbox', 'acorn tv', 'shudder', 'fubo', 'sling'
]
const PROVIDER_WORD_PATTERN = PROVIDER_WORDS.map((w) => w.replace('+', '\\+')).join('|')

const AVAILABILITY_PATTERNS = [
  /\b(where|how)\b[^\n]{0,60}?\b(watch|stream|see|find)\b/i,
  /\b(can|could) i (watch|stream|see)\b/i,
  new RegExp(`\\bon (${PROVIDER_WORD_PATTERN})\\b`, 'i')
]

export function wantsAvailability(text: string): boolean {
  return AVAILABILITY_PATTERNS.some((pattern) => pattern.test(text))
}

const SERVICE_CHANGES_PATTERN =
  /(new on|what'?s new|whats new|just added|added to|coming (soon )?to|leaving|leaves|left|new this (week|month|weekend)|\bdrop(ped|ping)?\b)/i

export function wantsServiceChanges(text: string): boolean {
  return SERVICE_CHANGES_PATTERN.test(text)
}

export interface AvailabilityContext {
  title: string
  mediaType: MediaType
  region: string
  flatrate: string[]
  rent: string[]
  buy: string[]
}

export interface ServiceChangesContext {
  provider: string
  added: string[]
  coming: string[]
  leaving: string[]
}

// Watch-provider data drifts slowly; 6h mirrors api/watchProviders. The
// wrapper object is because lru-cache can't store a null hit.
const availabilityCache = new LRUCache<string, { ctx: AvailabilityContext | null }>({ max: 2000, ttl: 1000 * 60 * 60 * 6 })

const providerNames = (list?: { provider_name?: string }[]): string[] =>
  (list || []).map((p) => p.provider_name).filter((n): n is string => Boolean(n))

// Words that make a question generic rather than title-seeking — "what's good
// on Netflix" must not strip to "good" and resolve a random movie.
const FILLER_PATTERN =
  /\b(movies?|shows?|series|tv|film|films|something|anything|good|great|best|top|new|recommend(?:ations?|ed)?|similar|tonight|stuff|things|popular|trending)\b/gi

// Loose questions like "is Dune still on Netflix?" carry no quoted/year'd
// mention — strip the question phrasing so a plain search can try the rest.
function questionRemainder(text: string): string {
  return text
    .replace(new RegExp(`\\b(where|how)\\b[^\\n]{0,60}?\\b(watch|stream|see|find)\\b`, 'ig'), ' ')
    .replace(new RegExp(`\\b(still |currently )?(available |streaming )?on (${PROVIDER_WORD_PATTERN})\\b`, 'ig'), ' ')
    .replace(/\b(can|could|do|did|i|is|was|it|this|that|the|a|an|to|for|me|my|yet|still|anywhere|online|free|now|right|please|hey|hi|ok|so|what|whats|which|who|when|should|would|will|tell|give|name|about|there|here|got|get|got)\b/gi, ' ')
    .replace(FILLER_PATTERN, ' ')
    .replace(/[?!.,;:'"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchAvailabilityContext(message: string, region: string): Promise<AvailabilityContext | null> {
  let id: number | null = null
  let mediaType: MediaType = 'movie'
  let title = ''

  const mentions = extractTitleMentions(message, 1)
  if (mentions.length) {
    const resolved = await resolveMovieMentions(mentions)
    if (resolved.length) {
      id = resolved[0].movieId
      mediaType = resolved[0].mediaType === 'tv' ? 'tv' : 'movie'
      title = resolved[0].title
    }
  }

  if (id == null) {
    const query = questionRemainder(message)
    if (query.length < 3 || query.length > 80) return null
    const top = (await searchMultiByQuery(query, 1))[0]
    if (!top) return null
    id = top.id
    mediaType = top.media_type === 'tv' ? 'tv' : 'movie'
    title = top.title || top.name || query
  }

  const cacheKey = `${mediaType}:${region}:${id}`
  const cached = availabilityCache.get(cacheKey)
  if (cached !== undefined) return cached.ctx

  let context: AvailabilityContext | null = null
  try {
    const data = await fetchTmdb<WatchProvidersResponse>(`/${mediaType}/${id}/watch/providers`)
    const offers = data.results?.[region] || {}
    const flatrate = providerNames(offers.flatrate)
    const rent = providerNames(offers.rent)
    const buy = providerNames(offers.buy)
    if (flatrate.length || rent.length || buy.length) {
      context = { title, mediaType, region, flatrate, rent, buy }
    }
  } catch (err) {
    console.error('Chat availability lookup failed:', err)
  }
  availabilityCache.set(cacheKey, { ctx: context })
  return context
}

const MAX_CONTEXT_SERVICES = 8
const TITLES_PER_KIND = 5

// Diffs are daily cron output — getProviderChanges memoizes 10min per
// instance, so warm requests cost zero Redis commands.
export async function fetchServiceChangesContext(serviceKeys: string[], region: string): Promise<ServiceChangesContext[] | null> {
  const changes = await getProviderChanges(serviceKeys.slice(0, MAX_CONTEXT_SERVICES), { region })
  const out: ServiceChangesContext[] = []
  for (const key of serviceKeys.slice(0, MAX_CONTEXT_SERVICES)) {
    const change = changes[key]
    if (!change) continue
    out.push({
      provider: change.source,
      added: change.added.slice(0, TITLES_PER_KIND).map((t) => t.title),
      coming: change.coming.slice(0, TITLES_PER_KIND).map((t) => `${t.title}${t.date ? ` (${t.date})` : ''}${t.season ? ` season ${t.season}` : ''}`),
      leaving: change.left.slice(0, TITLES_PER_KIND).map((t) => t.title)
    })
  }
  return out.length ? out : null
}
