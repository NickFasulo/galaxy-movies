import type { NextApiRequest, NextApiResponse } from 'next'
import { normalizeTvTitle } from '../../utils/tmdb'
import { firstParam } from '../../utils/query'
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

import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../utils/api'

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

const MEDIA_TYPES = new Set(['movie', 'tv', 'trending'])
const VALID_CATEGORIES = new Set([...Object.keys(GENRE_MAP), 'popular', 'now_playing', 'upcoming', 'top_rated'])
const MAX_SEARCH_LENGTH = 100
const MAX_PAGE = 500

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const ip = getClientIP(req)

  const allowed = await checkDistributedRateLimit(ip, {
    keyPrefix: 'movies_rl',
    maxRequests: 50,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' })
  }
  const category = String(firstParam(req.query.category) || 'popular')
  const media = String(firstParam(req.query.media) || 'movie')
  const search = String(firstParam(req.query.search) || '').slice(0, MAX_SEARCH_LENGTH)
  const page = firstParam(req.query.page) || '1'

  if (!MEDIA_TYPES.has(media) || !VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ message: 'Invalid category or media type' })
  }

  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const popularCutoffYear = now.getFullYear() - 3
  const popularCutoffDate = `${popularCutoffYear}-01-01`
  const ninetyDaysAgo = new Date(new Date().setDate(now.getDate() - 90)).toISOString().split('T')[0]

  try {
    const pageNum = Math.min(MAX_PAGE, Math.max(1, parseInt(page, 10) || 1))
    let endpoint = ''

    if (search.trim().length > 0) {
      if (media === 'tv') {
        endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
      } else if (media === 'trending') {
        endpoint = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
      } else {
        endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
      }
    } else if (media === 'tv') {
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&vote_count.gte=10`
    } else if (media === 'trending') {
      endpoint = `https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&page=${pageNum}`
    } else if (GENRE_MAP[category]) {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=primary_release_date.desc&primary_release_date.lte=${todayStr}&vote_count.gte=50&with_genres=${GENRE_MAP[category]}`
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${popularCutoffDate}`
    } else if (category === 'now_playing') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${ninetyDaysAgo}&primary_release_date.lte=${todayStr}`
    } else if (category === 'upcoming') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${todayStr}`
    } else {
      endpoint = `https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${pageNum}&include_adult=false`
    }

    const response = await fetch(endpoint)
    if (!response.ok) {
      const status = response.status === 401 ? 502 : response.status
      return res.status(status).json({
        message: response.status === 401
          ? 'TMDB rejected the configured API key'
          : 'TMDB API fetch failed'
      })
    }

    const data: TmdbPaged<RawResult> = await response.json()

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
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}