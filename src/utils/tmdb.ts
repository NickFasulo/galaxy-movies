import type { NormalizedTvShow, TmdbCollection, TmdbMovie, TmdbPaged, TmdbTvShow } from '../types/tmdb'

const TMDB_URL = 'https://api.themoviedb.org/3'

export type TmdbParams = Record<string, string | number | boolean | null | undefined>

export interface MovieCategory {
  title: string
  description: string
  sortBy: string
  language?: string
}

export interface TvCategory {
  title: string
  description: string
}

export interface GenreDef {
  id: number
  title: string
}

export interface StreamingProvider {
  title: string
  ids: { default: number; [region: string]: number }
  regions?: string[]
}

export interface DiscoverOptions {
  category?: string
  genreId?: number | string | null
  providerId?: number | string | null
  region?: string
  page?: number
}

export async function fetchTmdb<T>(path: string, params: TmdbParams = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    throw new Error('TMDB_API_KEY is missing')
  }

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    )
  })
  // fetch has no default timeout — a stalled TMDB connection would hold SSR
  // open until Vercel kills the function (a real 5xx for Googlebot). One retry
  // absorbs transient 429s, e.g. when the sitemap fan-out bursts upstream.
  let response: Response | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(`${TMDB_URL}${path}?${searchParams}`, { signal: AbortSignal.timeout(8000) })
      if (response.ok || (response.status !== 429 && response.status < 500)) break
    } catch {
      response = null
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400))
  }

  if (!response?.ok) {
    throw new Error(`TMDB request failed with status ${response?.status ?? 'timeout'}`)
  }

  return response.json() as Promise<T>
}

export const movieCategories: Record<string, MovieCategory> = {
  popular: {
    title: 'Popular Movies',
    description: 'Browse popular movies and discover what audiences are watching now.',
    sortBy: 'popularity.desc'
  },
  'now-playing': {
    title: 'Now Playing Movies',
    description: 'Find movies recently released in theaters and worth seeing this week.',
    sortBy: 'popularity.desc'
  },
  upcoming: {
    title: 'Upcoming Movies',
    description: 'Explore upcoming movies and keep track of what is coming soon.',
    sortBy: 'popularity.desc'
  },
  bollywood: {
    title: 'Bollywood Movies',
    description: 'Discover popular Hindi-language Bollywood movies, from new releases to all-time favorites.',
    sortBy: 'popularity.desc',
    language: 'hi'
  },
  tamil: {
    title: 'Tamil Movies',
    description: 'Explore popular Tamil-language movies from Kollywood cinema.',
    sortBy: 'popularity.desc',
    language: 'ta'
  },
  telugu: {
    title: 'Telugu Movies',
    description: 'Explore popular Telugu-language movies from Tollywood cinema.',
    sortBy: 'popularity.desc',
    language: 'te'
  }
}

export const movieGenres: Record<string, GenreDef> = {
  action: { id: 28, title: 'Action Movies' },
  adventure: { id: 12, title: 'Adventure Movies' },
  animation: { id: 16, title: 'Animation Movies' },
  comedy: { id: 35, title: 'Comedy Movies' },
  crime: { id: 80, title: 'Crime Movies' },
  documentary: { id: 99, title: 'Documentary Movies' },
  drama: { id: 18, title: 'Drama Movies' },
  family: { id: 10751, title: 'Family Movies' },
  fantasy: { id: 14, title: 'Fantasy Movies' },
  horror: { id: 27, title: 'Horror Movies' },
  mystery: { id: 9648, title: 'Mystery Movies' },
  romance: { id: 10749, title: 'Romance Movies' },
  'science-fiction': { id: 878, title: 'Science Fiction Movies' },
  thriller: { id: 53, title: 'Thriller Movies' }
}

export const tvCategories: Record<string, TvCategory> = {
  popular: {
    title: 'Popular TV Shows',
    description: 'Browse popular TV shows and discover what audiences are watching now.'
  },
  'airing-today': {
    title: 'TV Shows Airing Today',
    description: 'Find shows with new episodes airing today and worth catching tonight.'
  },
  'on-the-air': {
    title: 'TV Shows On the Air',
    description: 'Explore shows currently airing new episodes this week.'
  },
  'top-rated': {
    title: 'Top Rated TV Shows',
    description: 'Discover the highest-rated TV shows of all time, ranked by audience scores.'
  }
}

// TV genre ids are a separate TMDB namespace from movie genres — several slugs
// that share a name map to different ids (e.g. sci-fi: 878 movie / 10765 tv).
export const tvGenres: Record<string, GenreDef> = {
  'action-adventure': { id: 10759, title: 'Action & Adventure Shows' },
  animation: { id: 16, title: 'Animated Shows' },
  comedy: { id: 35, title: 'Comedy Shows' },
  crime: { id: 80, title: 'Crime Shows' },
  documentary: { id: 99, title: 'Documentary Shows' },
  drama: { id: 18, title: 'Drama Shows' },
  family: { id: 10751, title: 'Family Shows' },
  kids: { id: 10762, title: 'Kids Shows' },
  mystery: { id: 9648, title: 'Mystery Shows' },
  reality: { id: 10764, title: 'Reality Shows' },
  'sci-fi-fantasy': { id: 10765, title: 'Sci-Fi & Fantasy Shows' },
  'war-politics': { id: 10768, title: 'War & Politics Shows' },
  western: { id: 37, title: 'Western Shows' }
}

// Normalizes TMDB tv results to the movie-shaped fields cards/grids consume.
export function normalizeTvTitle(show: TmdbTvShow): NormalizedTvShow {
  return {
    ...show,
    title: show.name,
    release_date: show.first_air_date,
    mediaType: 'tv'
  }
}

const hasPoster = <T extends { poster_path?: string | null }>(item: T) => Boolean(item.poster_path)

const pagedMovies = (data: TmdbPaged<TmdbMovie>): TmdbPaged<TmdbMovie> => ({
  ...data,
  results: (data.results || []).filter(hasPoster)
})

const pagedTv = (data: TmdbPaged<TmdbTvShow>): TmdbPaged<NormalizedTvShow> => ({
  ...data,
  results: (data.results || []).filter(hasPoster).map(normalizeTvTitle)
})

function withCatalogFilters(params: TmdbParams, { genreId, providerId, region }: Pick<DiscoverOptions, 'genreId' | 'providerId' | 'region'>): TmdbParams {
  if (genreId) params.with_genres = genreId
  if (providerId) {
    params.with_watch_providers = providerId
    params.watch_region = region || 'US'
  }
  return params
}

// TMDB's watch-provider catalog is region-scoped: the same real-world service can
// have a different provider_id per `watch_region` (e.g. Amazon Prime Video is id 9
// in the US catalog but id 119 in the India catalog). `ids.default` is used when a
// region-specific id isn't listed. `regions`, when present, restricts which regions
// the service is actually offered in (used for display copy, not just querying).
export const streamingProviders: Record<string, StreamingProvider> = {
  netflix: { title: 'Netflix Movies', ids: { default: 8 } },
  'amazon-prime-video': { title: 'Amazon Prime Video Movies', ids: { default: 9, IN: 119 } },
  hulu: { title: 'Hulu Movies', ids: { default: 15 }, regions: ['US'] },
  'disney-plus': { title: 'Disney+ Movies', ids: { default: 337 }, regions: ['US'] },
  'apple-tv': { title: 'Apple TV Movies', ids: { default: 2 } },
  max: { title: 'Max Movies', ids: { default: 1899 }, regions: ['US'] },
  peacock: { title: 'Peacock Movies', ids: { default: 386 }, regions: ['US'] },
  'paramount-plus': { title: 'Paramount+ Movies', ids: { default: 531 }, regions: ['US'] },
  jiohotstar: { title: 'JioHotstar Movies', ids: { default: 2336 }, regions: ['IN'] },
  zee5: { title: 'ZEE5 Movies', ids: { default: 232 }, regions: ['IN'] },
  sonyliv: { title: 'SonyLIV Movies', ids: { default: 237 }, regions: ['IN'] }
}

export function getProviderId(providerKey: string, region = 'US'): number | null {
  const provider = streamingProviders[providerKey]
  if (!provider) return null
  return provider.ids[region] ?? provider.ids.default
}

export function isProviderAvailableInRegion(providerKey: string, region = 'US'): boolean {
  const provider = streamingProviders[providerKey]
  if (!provider) return false
  return !provider.regions || provider.regions.includes(region)
}

export async function fetchDiscoverMovies({ category, genreId, providerId, region, page = 1 }: DiscoverOptions): Promise<TmdbPaged<TmdbMovie>> {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const params: TmdbParams = {
    page,
    include_adult: 'false',
    sort_by: 'popularity.desc',
    'vote_count.gte': 10
  }

  if (category === 'popular') {
    params['primary_release_date.gte'] = `${now.getFullYear() - 3}-01-01`
  } else if (category === 'now-playing') {
    params['primary_release_date.gte'] = ninetyDaysAgo.toISOString().split('T')[0]
    params['primary_release_date.lte'] = today
  } else if (category === 'upcoming') {
    params['primary_release_date.gte'] = today
  }

  const categoryLanguage = category && movieCategories[category]?.language
  if (categoryLanguage) {
    params.with_original_language = categoryLanguage
  }

  withCatalogFilters(params, { genreId, providerId, region })

  return pagedMovies(await fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', params))
}

export async function fetchListMovies(discoverParams: TmdbParams = {}, page = 1): Promise<TmdbPaged<TmdbMovie>> {
  return pagedMovies(await fetchList('/discover/movie', discoverParams, page))
}

async function fetchList(path: '/discover/movie' | '/discover/tv', discoverParams: TmdbParams, page: number) {
  return fetchTmdb<TmdbPaged<TmdbMovie & TmdbTvShow>>(path, {
    page,
    include_adult: 'false',
    'vote_count.gte': 50,
    ...discoverParams
  })
}

export async function fetchDiscoverTv({ category, genreId, providerId, region, page = 1 }: DiscoverOptions): Promise<TmdbPaged<NormalizedTvShow>> {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const daysAgo = (n: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  }
  const daysAhead = (n: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }

  const params: TmdbParams = {
    page,
    include_adult: 'false',
    'vote_count.gte': 10
  }

  if (category === 'airing-today') {
    params['air_date.gte'] = today
    params['air_date.lte'] = today
    params.sort_by = 'popularity.desc'
  } else if (category === 'on-the-air') {
    params['air_date.gte'] = daysAgo(7)
    params['air_date.lte'] = daysAhead(7)
    params.sort_by = 'popularity.desc'
  } else if (category === 'top-rated') {
    params.sort_by = 'vote_average.desc'
    params['vote_count.gte'] = 200
  } else {
    params.sort_by = 'popularity.desc'
  }

  withCatalogFilters(params, { genreId, providerId, region })

  return pagedTv(await fetchTmdb<TmdbPaged<TmdbTvShow>>('/discover/tv', params))
}

export async function fetchListTv(discoverParams: TmdbParams = {}, page = 1): Promise<TmdbPaged<NormalizedTvShow>> {
  return pagedTv(await fetchList('/discover/tv', discoverParams, page))
}

export async function fetchRecommendedTv(showId: number | string, page = 1): Promise<TmdbPaged<NormalizedTvShow>> {
  return pagedTv(await fetchTmdb<TmdbPaged<TmdbTvShow>>(`/tv/${showId}/recommendations`, { page }))
}

export async function searchTvByTitle(title: string): Promise<NormalizedTvShow | null> {
  const data = await fetchTmdb<TmdbPaged<TmdbTvShow>>('/search/tv', { query: title, include_adult: 'false' })
  const show = (data.results || []).find(hasPoster)
  return show ? normalizeTvTitle(show) : null
}

export async function fetchRecommendedMovies(movieId: number | string, page = 1): Promise<TmdbPaged<TmdbMovie>> {
  return pagedMovies(await fetchTmdb<TmdbPaged<TmdbMovie>>(`/movie/${movieId}/recommendations`, { page }))
}

export async function searchMovieByTitle(title: string): Promise<TmdbMovie | null> {
  const data = await fetchTmdb<TmdbPaged<TmdbMovie>>('/search/movie', { query: title, include_adult: 'false' })
  return (data.results || []).find(hasPoster) || null
}

export async function searchKeywordId(name: string): Promise<number | null> {
  const data = await fetchTmdb<{ results?: { id: number; name: string }[] }>('/search/keyword', { query: name })
  return data.results?.[0]?.id || null
}

export async function fetchCollection(collectionId: number | string): Promise<TmdbCollection> {
  return fetchTmdb<TmdbCollection>(`/collection/${collectionId}`)
}
