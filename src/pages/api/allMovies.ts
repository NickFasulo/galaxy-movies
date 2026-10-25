import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchTmdb, normalizeTvTitle, getProviderIds, TmdbError, type TmdbParams } from '../../features/catalog/tmdb'
import { firstParam, requireMethod, rejectBot, setApiCache } from '../../lib/http'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget, isGlobalBudgetTripped } from '../../lib/rateLimiter'
import type { TitleSummary, TmdbPaged, TmdbTvShow } from '../../types/tmdb'

const GENRE_MAP: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  sci_fi: 878,
  thriller: 53,
  war: 10752,
  western: 37
}

type RawResult = TitleSummary & TmdbTvShow

function normalizeResults(results: RawResult[] | undefined) {
  return (results || [])
    .filter(item => {
      if (!item?.poster_path) return false
      // /search/multi and /trending/all return mixed types; keep movie + tv only
      if (item.media_type && item.media_type !== 'movie' && item.media_type !== 'tv') return false
      return true
    })
    .map(item => (item.media_type === 'movie' ? { ...item, mediaType: 'movie' } : normalizeTvTitle(item)))
}

// Homepage feed keys → TMDB with_original_language — the same ids the
// /browse/<category> movie pages already use.
const LANGUAGE_MAP: Record<string, string> = {
  bollywood: 'hi',
  tamil: 'ta',
  telugu: 'te',
  bengali: 'bn',
  malayalam: 'ml',
  kannada: 'kn',
  marathi: 'mr'
}

const MEDIA_TYPES = new Set(['movie', 'tv', 'trending'])
const VALID_CATEGORIES = new Set([...Object.keys(GENRE_MAP), ...Object.keys(LANGUAGE_MAP), 'popular', 'now_playing', 'upcoming', 'top_rated'])
const MAX_SEARCH_LENGTH = 100
const MAX_PAGE = 500

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const ip = getClientIP(req)

  // Same rotating-IP breaker as /api/discover — this feed fans out to TMDB
  // on every uncached page, so per-IP alone can't bound upstream calls.
  if (isGlobalBudgetTripped('allmovies')) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' })
  }
  const [allowed, withinGlobal] = await Promise.all([
    checkDistributedRateLimit(ip, {
      keyPrefix: 'movies_rl',
      maxRequests: 50,
      windowSeconds: 60 * 60
    }),
    checkGlobalBudget('allmovies', { maxRequests: 5000, windowSeconds: 60 * 60 })
  ])
  if (!allowed || !withinGlobal) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' })
  }
  const category = String(firstParam(req.query.category) || 'popular')
  const media = String(firstParam(req.query.media) || 'movie')
  const search = String(firstParam(req.query.search) || '').slice(0, MAX_SEARCH_LENGTH)
  const page = firstParam(req.query.page) || '1'
  const regionParam = String(firstParam(req.query.region) || '')
  const region = /^[A-Z]{2}$/.test(regionParam) ? regionParam : 'US'
  const providerIds = String(firstParam(req.query.providers) || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .flatMap((key) => getProviderIds(key, region))
  // TMDB search/trending/movie-list endpoints don't support watch-provider
  // filtering — only discover endpoints get it merged below.
  const providerParams: TmdbParams = providerIds.length
    ? {
        with_watch_providers: providerIds.join('|'),
        watch_region: region,
        with_watch_monetization_types: 'flatrate|free|ads'
      }
    : {}

  if (!MEDIA_TYPES.has(media) || !VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ message: 'Invalid category or media type' })
  }

  if (!process.env.TMDB_API_KEY) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const popularCutoffYear = now.getFullYear() - 3
  const popularCutoffDate = `${popularCutoffYear}-01-01`
  const ninetyDaysAgo = new Date(new Date().setDate(now.getDate() - 90)).toISOString().split('T')[0]

  try {
    const pageNum = Math.min(MAX_PAGE, Math.max(1, parseInt(page, 10) || 1))
    let path = ''
    let params: TmdbParams = {}

    if (search.trim().length > 0) {
      path = media === 'tv' ? '/search/tv' : media === 'trending' ? '/search/multi' : '/search/movie'
      params = { query: search, page: pageNum, include_adult: 'false' }
    } else if (media === 'tv') {
      path = '/discover/tv'
      params = { page: pageNum, include_adult: 'false', sort_by: 'popularity.desc', 'vote_count.gte': 10, ...providerParams }
    } else if (media === 'trending') {
      path = '/trending/all/week'
      params = { page: pageNum }
    } else if (LANGUAGE_MAP[category]) {
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'popularity.desc', 'vote_count.gte': 10, with_original_language: LANGUAGE_MAP[category], ...providerParams }
    } else if (GENRE_MAP[category]) {
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'primary_release_date.desc', 'primary_release_date.lte': todayStr, 'vote_count.gte': 50, with_genres: GENRE_MAP[category], ...providerParams }
    } else if (category === 'popular') {
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'popularity.desc', 'primary_release_date.gte': popularCutoffDate, ...providerParams }
    } else if (category === 'now_playing') {
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'popularity.desc', 'primary_release_date.gte': ninetyDaysAgo, 'primary_release_date.lte': todayStr, ...providerParams }
    } else if (category === 'upcoming') {
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'popularity.desc', 'primary_release_date.gte': todayStr, ...providerParams }
    } else if (category === 'top_rated' && providerIds.length) {
      // /movie/top_rated can't filter by provider — swap to an equivalent discover query
      path = '/discover/movie'
      params = { page: pageNum, include_adult: 'false', sort_by: 'vote_average.desc', 'vote_count.gte': 200, ...providerParams }
    } else {
      path = `/movie/${category}`
      params = { page: pageNum, include_adult: 'false' }
    }

    const data = await fetchTmdb<TmdbPaged<RawResult>>(path, params)

    if (media !== 'movie') {
      setApiCache(res, 1800, 3600, { cdn: true })
      return res.status(200).json({ ...data, results: normalizeResults(data.results) })
    }

    const rawMovies = data.results || []

    const filteredMovies = rawMovies.filter(movie => {
      if (!movie?.poster_path) return false
      
      if (search.trim().length > 0) {
        return true
      }
      
      if (category === 'popular' && movie.release_date) {
        const releaseYear = new Date(movie.release_date).getFullYear()
        if (releaseYear < popularCutoffYear) return false
      }

      if (category === 'upcoming' && movie.release_date) {
        if (movie.release_date < todayStr) return false
      }

      return true
    })

    setApiCache(res, 1800, 3600, { cdn: true })

    return res.status(200).json({
      ...data,
      results: filteredMovies
    })
  } catch (error) {
    console.error('allMovies error:', error)
    const status = error instanceof TmdbError ? error.status : undefined
    if (status === 401) {
      return res.status(502).json({ message: 'TMDB rejected the configured API key' })
    }
    if (status) {
      return res.status(status).json({ message: 'TMDB API fetch failed' })
    }
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}
