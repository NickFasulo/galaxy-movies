import { fetchTmdb, movieGenres, streamingProviders } from './tmdb'

export async function searchMoviesByQuery(query, page = 1) {
  try {
    const data = await fetchTmdb('/search/movie', {
      query,
      page,
      include_adult: false
    })
    
    return {
      results: (data.results || []).filter(movie => movie.poster_path),
      total_pages: data.total_pages,
      total_results: data.total_results
    }
  } catch (error) {
    console.error('Error searching movies:', error)
    return { results: [], total_pages: 0, total_results: 0 }
  }
}

export async function discoverMoviesWithFilters(filters = {}, page = 1) {
  try {
    const params = {
      page,
      include_adult: false,
      sort_by: filters.sort_by || 'popularity.desc',
      'vote_count.gte': 10
    }

    if (filters.genre) {
      const genreId = movieGenres[filters.genre]?.id
      if (genreId) {
        params.with_genres = genreId
      }
    }

    if (filters.year) {
      params['primary_release_year'] = filters.year
    }

    if (filters.min_rating) {
      params['vote_average.gte'] = filters.min_rating
    }

    if (filters.provider) {
      const providerId = streamingProviders[filters.provider]?.id
      if (providerId) {
        params.with_watch_providers = providerId
        params.watch_region = filters.region || 'US'
      }
    }

    if (filters.language) {
      params.with_original_language = filters.language
    }

    const data = await fetchTmdb('/discover/movie', params)
    
    return {
      results: (data.results || []).filter(movie => movie.poster_path),
      total_pages: data.total_pages,
      total_results: data.total_results
    }
  } catch (error) {
    console.error('Error discovering movies:', error)
    return { results: [], total_pages: 0, total_results: 0 }
  }
}

export async function getMoviesByGenre(genre, page = 1) {
  return discoverMoviesWithFilters({ genre }, page)
}

export async function getMoviesByProvider(provider, region = 'US', page = 1) {
  return discoverMoviesWithFilters({ provider, region }, page)
}

export async function getTrendingMovies(timeWindow = 'day', page = 1) {
  try {
    const data = await fetchTmdb(`/trending/movie/${timeWindow}`, { page })
    
    return {
      results: (data.results || []).filter(movie => movie.poster_path),
      total_pages: data.total_pages,
      total_results: data.total_results
    }
  } catch (error) {
    console.error('Error getting trending movies:', error)
    return { results: [], total_pages: 0, total_results: 0 }
  }
}

export async function getSimilarMovies(movieId, page = 1) {
  try {
    const data = await fetchTmdb(`/movie/${movieId}/similar`, { page })
    
    return {
      results: (data.results || []).filter(movie => movie.poster_path),
      total_pages: data.total_pages,
      total_results: data.total_results
    }
  } catch (error) {
    console.error('Error getting similar movies:', error)
    return { results: [], total_pages: 0, total_results: 0 }
  }
}

export async function getMovieDetails(movieId) {
  try {
    const data = await fetchTmdb(`/movie/${movieId}`, {
      append_to_response: 'credits,videos,watch/providers'
    })
    return data
  } catch (error) {
    console.error('Error getting movie details:', error)
    return null
  }
}

export function parseNaturalLanguageQuery(query) {
  const filters = {}
  const lowerQuery = query.toLowerCase()

  const genreKeywords = {
    'action': 'action', 'comedy': 'comedy', 'drama': 'drama',
    'horror': 'horror', 'thriller': 'thriller', 'sci-fi': 'science-fiction',
    'science fiction': 'science-fiction', 'romance': 'romance',
    'animation': 'animation', 'documentary': 'documentary',
    'fantasy': 'fantasy', 'adventure': 'adventure', 'crime': 'crime',
    'mystery': 'mystery', 'family': 'family'
  }

  for (const [keyword, genre] of Object.entries(genreKeywords)) {
    if (lowerQuery.includes(keyword)) {
      filters.genre = genre
      break
    }
  }

  const providerKeywords = {
    'netflix': 'netflix', 'amazon': 'amazon-prime-video',
    'prime': 'amazon-prime-video', 'hulu': 'hulu',
    'disney': 'disney-plus', 'disney+': 'disney-plus',
    'apple tv': 'apple-tv', 'max': 'max', 'hbo': 'max'
  }

  for (const [keyword, provider] of Object.entries(providerKeywords)) {
    if (lowerQuery.includes(keyword)) {
      filters.provider = provider
      break
    }
  }

  const yearMatch = query.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    filters.year = parseInt(yearMatch[0])
  }

  const ratingMatch = query.match(/(\d+(\.\d+)?)\s*stars?/i)
  if (ratingMatch) {
    filters.min_rating = parseFloat(ratingMatch[1])
  }

  return filters
}

export function formatMovieForChat(movie) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A',
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
    overview: movie.overview?.substring(0, 200) + (movie.overview?.length > 200 ? '...' : ''),
    genres: movie.genres?.map(g => g.name).join(', ') || 'N/A'
  }
}

export async function getSmartRecommendations(query, limit = 5) {
  const filters = parseNaturalLanguageQuery(query)
  
  if (Object.keys(filters).length > 0) {
    const results = await discoverMoviesWithFilters(filters, 1)
    return results.results.slice(0, limit).map(formatMovieForChat)
  } else {
    const results = await searchMoviesByQuery(query, 1)
    return results.results.slice(0, limit).map(formatMovieForChat)
  }
}