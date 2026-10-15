import { LRUCache } from 'lru-cache'
import { fetchTmdb, fetchDiscoverMovies, fetchDiscoverTv, getProviderIds, movieGenres, tvGenres, streamingProviders } from './tmdb'
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

// Service-scoped recommendations ("recommend action movies on hulu",
// "what should i watch on my services"). Provider names people type → our
// provider keys; unmapped names (mubi, britbox, ...) simply can't be grounded.
const PROVIDER_KEY_WORDS: [RegExp, string][] = [
  [/netflix/i, 'netflix'],
  [/prime( video)?|amazon/i, 'amazon-prime-video'],
  [/hulu/i, 'hulu'],
  [/disney\+?/i, 'disney-plus'],
  [/apple( tv)?\+?/i, 'apple-tv'],
  [/\b(max|hbo)\b/i, 'max'],
  [/peacock/i, 'peacock'],
  [/paramount\+?/i, 'paramount-plus'],
  [/tubi/i, 'tubi'],
  [/pluto( tv)?/i, 'pluto-tv'],
  [/roku/i, 'roku-channel'],
  [/crunchyroll/i, 'crunchyroll'],
  [/jio ?hotstar|hotstar/i, 'jiohotstar'],
  [/zee ?5/i, 'zee5'],
  [/sony ?liv/i, 'sonyliv']
]

const MY_SERVICES_PATTERN = /\b(my|your|our) (services|streamers|subscriptions|platforms)\b/i

// Spoken genre words → slug per TMDB's separate movie/tv genre namespaces.
const GENRE_WORDS: Record<string, { movie?: string; tv?: string }> = {
  action: { movie: 'action', tv: 'action-adventure' },
  adventure: { movie: 'adventure', tv: 'action-adventure' },
  animation: { movie: 'animation', tv: 'animation' },
  comedy: { movie: 'comedy', tv: 'comedy' },
  crime: { movie: 'crime', tv: 'crime' },
  documentary: { movie: 'documentary', tv: 'documentary' },
  drama: { movie: 'drama', tv: 'drama' },
  family: { movie: 'family', tv: 'family' },
  fantasy: { movie: 'fantasy', tv: 'sci-fi-fantasy' },
  horror: { movie: 'horror' },
  mystery: { movie: 'mystery', tv: 'mystery' },
  romance: { movie: 'romance' },
  'sci-fi': { movie: 'science-fiction', tv: 'sci-fi-fantasy' },
  thriller: { movie: 'thriller' },
  western: { tv: 'western' },
  war: { tv: 'war-politics' },
  reality: { tv: 'reality' },
  kids: { tv: 'kids' }
}

// Keys get an optional plural `s?`; irregular plurals and colloquial genre
// words ("scary", "funny", "romcom") live in the alternation + alias table.
const GENRE_WORD_PATTERN = new RegExp(
  `\\b(${Object.keys(GENRE_WORDS).map((k) => `${k}s?`).join('|')}|animated|comedies|documentaries|mysteries|romantic|scifi|science fiction|scary|spooky|creepy|terrifying|funny|hilarious|rom-?coms?)\\b`,
  'i'
)

const GENRE_ALIASES: Record<string, string> = {
  animated: 'animation', comedies: 'comedy', documentaries: 'documentary',
  mysteries: 'mystery', romantic: 'romance', scifi: 'sci-fi',
  'science fiction': 'sci-fi', scary: 'horror', spooky: 'horror',
  creepy: 'horror', terrifying: 'horror', funny: 'comedy', hilarious: 'comedy',
  'rom-com': 'romance', romcom: 'romance', 'rom-coms': 'romance', romcoms: 'romance'
}

const canonicalGenre = (word: string): string => {
  const w = word.toLowerCase()
  if (GENRE_ALIASES[w]) return GENRE_ALIASES[w]
  if (GENRE_WORDS[w]) return w
  const singular = w.replace(/s$/, '')
  return GENRE_ALIASES[singular] ?? (GENRE_WORDS[singular] ? singular : w)
}

const RECOMMEND_PATTERN =
  /\b(recommend(?:ations?|ed)?|suggest(?:ions?|ed)?|pick|good|great|best|top|some(thing)?|any(thing)?|what('?s| is) on|what should|what to|worth watching|binge)\b/i

// Recency asks — "recent mystery movies", "new films from this year", "2024
// horror". Bare "new on" belongs to the catalog-change intent and never
// reaches here (wantsServiceChanges wins inside wantsServiceRecommendation).
const RECENT_PATTERN = /\b(recent(?:ly)?|latest|newest|new|this (year|month)|last (year|month)|20\d\d)\b/i
const RECENT_WINDOW_DAYS = 365

// "more recent releases", "what about comedies?" — continuation phrasing that
// carries no scope of its own and inherits it from the conversation.
const FOLLOWUP_PATTERN = /\b(more|another|others?|else|similar|like (that|those|it)|instead|what about|how about|different|newer|older|recent|latest|any|of (those|them|these))\b/i

// Ordered by last mention position — for follow-up turns the freshest provider
// in the conversation wins over stale ones.
const providerKeysIn = (text: string): string[] =>
  PROVIDER_KEY_WORDS
    .map(([pattern, key]) => {
      const matches = [...text.matchAll(new RegExp(pattern.source, 'gi'))]
      return { key, lastIndex: matches.length ? matches[matches.length - 1].index ?? 0 : -1 }
    })
    .filter((m) => m.lastIndex >= 0)
    .sort((a, b) => b.lastIndex - a.lastIndex)
    .map((m) => m.key)

export function wantsServiceRecommendation(text: string, contextText = ''): boolean {
  // Catalog-change phrasing ("did anything drop on hulu") wins — its diff
  // data answers the question more precisely than a popularity list.
  if (wantsServiceChanges(text)) return false
  const isFollowup = contextText.length > 0 && FOLLOWUP_PATTERN.test(text)
  const subject = isFollowup ? `${text} ${contextText}` : text
  const hasServiceScope =
    providerKeysIn(subject).length > 0 ||
    new RegExp(`\\b(${PROVIDER_WORD_PATTERN})\\b`, 'i').test(subject) ||
    MY_SERVICES_PATTERN.test(subject)
  return hasServiceScope && (RECOMMEND_PATTERN.test(subject) || GENRE_WORD_PATTERN.test(subject) || RECENT_PATTERN.test(subject))
}

export interface ServicePicksContext {
  provider: string
  mediaType: MediaType
  genre: string | null
  releasedAfter?: string
  titles: { id: number; title: string; year: string | null }[]
}

const MAX_PICK_PROVIDERS = 3
const TITLES_PER_PROVIDER = 8

// Same catalog data the /streaming/{provider}/{genre} pages serve; 6h like
// the availability cache since discover results drift slowly.
const picksCache = new LRUCache<string, { ctx: ServicePicksContext[] | null }>({ max: 500, ttl: 1000 * 60 * 60 * 6 })

const providerLabel = (key: string) => streamingProviders[key]?.title.replace(/\s+Movies$/i, '') || key

function detectPickMediaType(text: string): MediaType | null {
  if (/\b(movies?|films?)\b/i.test(text)) return 'movie'
  if (/\b(shows?|series|tv)\b/i.test(text)) return 'tv'
  return null
}

// Compound asks ("comedy horror", "action thriller") become a comma-joined
// genre id list — TMDB treats comma as AND, which is exactly what the phrase
// means.
const GENRE_WORD_GLOBAL = new RegExp(GENRE_WORD_PATTERN.source, 'gi')

function detectGenreSlugs(text: string, mediaType: MediaType): string[] {
  const slugs: string[] = []
  for (const m of text.toLowerCase().matchAll(GENRE_WORD_GLOBAL)) {
    const slug = GENRE_WORDS[canonicalGenre(m[1])]?.[mediaType]
    if (slug && !slugs.includes(slug)) slugs.push(slug)
  }
  return slugs
}

export async function fetchServicePicksContext(message: string, serviceKeys: string[], region: string, contextText = ''): Promise<ServicePicksContext[] | null> {
  let keys = providerKeysIn(message)
  if (!keys.length && contextText) keys = providerKeysIn(contextText)
  if (!keys.length && MY_SERVICES_PATTERN.test(message)) keys = serviceKeys.slice(0, MAX_PICK_PROVIDERS)
  keys = [...new Set(keys)].slice(0, MAX_PICK_PROVIDERS)
  if (!keys.length) return null

  const mediaType = detectPickMediaType(message) ?? (contextText ? detectPickMediaType(contextText) : null) ?? 'movie'
  const genreMap = mediaType === 'tv' ? tvGenres : movieGenres
  let genreSlugs = detectGenreSlugs(message, mediaType)
  if (!genreSlugs.length && contextText) genreSlugs = detectGenreSlugs(contextText, mediaType)
  const genreIds = genreSlugs.map((slug) => genreMap[slug]?.id).filter((id): id is number => typeof id === 'number')
  const genreId = genreIds.length > 1 ? genreIds.join(',') : genreIds[0] ?? null
  const genreLabel = genreSlugs
    .map((slug) => genreMap[slug]?.title.replace(/\s+(Movies|Shows)$/i, ''))
    .filter(Boolean)
    .join(' + ') || null
  const recent = RECENT_PATTERN.test(message) || (contextText.length > 0 && RECENT_PATTERN.test(contextText))
  const releasedAfter = recent
    ? new Date(Date.now() - RECENT_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    : undefined

  const cacheKey = `${mediaType}:${region}:${keys.join('+')}:${genreId ?? 'any'}:${releasedAfter ?? 'all'}`
  const cached = picksCache.get(cacheKey)
  if (cached !== undefined) return cached.ctx

  const out: ServicePicksContext[] = []
  for (const key of keys) {
    const providerIds = getProviderIds(key, region)
    if (!providerIds.length) continue
    try {
      const discover = mediaType === 'tv' ? fetchDiscoverTv : fetchDiscoverMovies
      const data = await discover({ providerId: providerIds.join('|'), genreId, region, releasedAfter })
      const titles = (data.results || []).slice(0, TITLES_PER_PROVIDER).map((t) => ({
        id: t.id,
        title: t.title || '',
        year: (t.release_date || '').slice(0, 4) || null
      }))
      if (titles.length) out.push({ provider: providerLabel(key), mediaType, genre: genreLabel, releasedAfter, titles })
    } catch (err) {
      console.error(`Chat service-picks lookup failed for ${key}:`, err)
    }
  }
  const ctx = out.length ? out : null
  picksCache.set(cacheKey, { ctx })
  return ctx
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
// on Netflix" must not strip to "good" and resolve a random movie. Genre words
// count as filler too ("action movies on hulu" must not resolve a movie called
// "Action").
const FILLER_PATTERN =
  /\b(movies?|shows?|series|tv|film|films|something|anything|good|great|best|top|new|recommend(?:ations?|ed)?|suggest(?:ions?|ed)?|similar|tonight|stuff|things|popular|trending|actions?|adventures?|animated?|animation|comed(?:y|ies)|crimes?|documentar(?:y|ies)|dramas?|family|fantas(?:y|ies)|horrors?|myster(?:y|ies)|romances?|romantic|thrillers?|westerns?|war|reality|soaps?|kids?|children|sci-?fi|science fiction|scary|spooky|creepy|terrifying|funny|hilarious|rom-?coms?)\b/gi

// Loose questions like "is Dune still on Netflix?" carry no quoted/year'd
// mention — strip the question phrasing so a plain search can try the rest.
function questionRemainder(text: string): string {
  return text
    .replace(new RegExp(`\\b(where|how)\\b[^\\n]{0,60}?\\b(watch|stream|see|find)\\b`, 'ig'), ' ')
    .replace(new RegExp(`\\b(still |currently )?(available |streaming )?on (${PROVIDER_WORD_PATTERN})\\b`, 'ig'), ' ')
    .replace(/\b(can|could|do|did|i|is|was|it|this|that|the|a|an|to|for|me|my|you|your|yours|us|we|our|some|yet|still|anywhere|online|free|now|right|please|hey|hi|ok|so|what|whats|which|who|when|should|would|will|tell|give|name|about|there|here|got|get|watch|watching|stream|streaming|see|find)\b/gi, ' ')
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
