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

export const streamingProviders = {
  netflix: { id: 8, title: 'Netflix Movies' },
  'amazon-prime-video': { id: 9, title: 'Amazon Prime Video Movies' },
  hulu: { id: 15, title: 'Hulu Movies' },
  'disney-plus': { id: 337, title: 'Disney+ Movies' },
  'apple-tv': { id: 2, title: 'Apple TV Movies' },
  max: { id: 1899, title: 'Max Movies' }
}

export async function fetchDiscoverMovies({ category, genreId, providerId, page = 1 }) {
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

  if (genreId) {
    params.with_genres = genreId
  }
  if (providerId) {
    params.with_watch_providers = providerId
    params.watch_region = 'US'
  }

  const data = await fetchTmdb('/discover/movie', params)
  return {
    ...data,
    results: (data.results || []).filter(movie => movie.poster_path)
  }
}
