const TMDB_URL = 'https://api.themoviedb.org/3'

export async function fetchTmdb(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    throw new Error('TMDB_API_KEY is missing')
  }

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    ...Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
    )
  })
  const response = await fetch(`${TMDB_URL}${path}?${searchParams}`)

  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`)
  }

  return response.json()
}

export const movieCategories = {
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

export const movieGenres = {
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

// TMDB's watch-provider catalog is region-scoped: the same real-world service can
// have a different provider_id per `watch_region` (e.g. Amazon Prime Video is id 9
// in the US catalog but id 119 in the India catalog). `ids.default` is used when a
// region-specific id isn't listed. `regions`, when present, restricts which regions
// the service is actually offered in (used for display copy, not just querying).
export const streamingProviders = {
  netflix: { title: 'Netflix Movies', ids: { default: 8 } },
  'amazon-prime-video': { title: 'Amazon Prime Video Movies', ids: { default: 9, IN: 119 } },
  hulu: { title: 'Hulu Movies', ids: { default: 15 }, regions: ['US'] },
  'disney-plus': { title: 'Disney+ Movies', ids: { default: 337 }, regions: ['US'] },
  'apple-tv': { title: 'Apple TV Movies', ids: { default: 2 } },
  max: { title: 'Max Movies', ids: { default: 1899 }, regions: ['US'] },
  jiohotstar: { title: 'JioHotstar Movies', ids: { default: 2336 }, regions: ['IN'] },
  zee5: { title: 'ZEE5 Movies', ids: { default: 232 }, regions: ['IN'] },
  sonyliv: { title: 'SonyLIV Movies', ids: { default: 237 }, regions: ['IN'] }
}

export function getProviderId(providerKey, region = 'US') {
  const provider = streamingProviders[providerKey]
  if (!provider) return null
  return provider.ids[region] ?? provider.ids.default
}

export function isProviderAvailableInRegion(providerKey, region = 'US') {
  const provider = streamingProviders[providerKey]
  if (!provider) return false
  return !provider.regions || provider.regions.includes(region)
}

export async function fetchDiscoverMovies({ category, genreId, providerId, region, page = 1 }) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const params = {
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

  if (genreId) {
    params.with_genres = genreId
  }
  if (providerId) {
    params.with_watch_providers = providerId
    params.watch_region = region || 'US'
  }

  const data = await fetchTmdb('/discover/movie', params)
  return {
    ...data,
    results: (data.results || []).filter(movie => movie.poster_path)
  }
}

// Powers /lists/[slug] editorial collections (see utils/curatedLists.js). Unlike
// fetchDiscoverMovies, the caller supplies the full TMDB discover filter set
// directly (genre/runtime/rating/date params etc.) since each list defines its
// own criteria rather than picking from the fixed category/genre/provider shapes.
export async function fetchListMovies(discoverParams = {}, page = 1) {
  const params = {
    page,
    include_adult: 'false',
    'vote_count.gte': 50,
    ...discoverParams
  }

  const data = await fetchTmdb('/discover/movie', params)
  return {
    ...data,
    results: (data.results || []).filter(movie => movie.poster_path)
  }
}
