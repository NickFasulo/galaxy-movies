import type { NextApiRequest, NextApiResponse } from 'next'
import {
  fetchDiscoverMovies,
  fetchDiscoverTv,
  fetchTmdb,
  getProviderIds,
  movieCategories,
  tvCategories,
  movieGenres,
  tvGenres,
  streamingProviders,
  normalizeTvTitle
} from '../../utils/catalog/tmdb'
import type { TmdbMovie, TmdbPaged, TmdbTvShow, TitleSummary } from '../../types/tmdb'
import { firstParam } from '../../utils/core/query'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget, isGlobalBudgetTripped } from '../../utils/core/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../utils/core/api'

const ID_RE = /^\d{1,10}$/
const REGION_RE = /^[A-Z]{2}$/
const MAX_PAGE = 500

const hasPoster = (t: { poster_path?: string | null }) => Boolean(t.poster_path)

// Paginated continuation for listing pages (org, genre, category, provider).
// Each mode mirrors the page's SSR query so page 2+ keeps the same ordering.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const ip = getClientIP(req)

  // Distributed floods rotate through fresh IPs under the per-IP cap, so
  // total calls are capped globally too. Once it trips, deny without any
  // Redis ops — at flood volume the checks themselves are the billed cost.
  if (isGlobalBudgetTripped('discover')) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' })
  }
  const [allowed, withinGlobal] = await Promise.all([
    checkDistributedRateLimit(ip, {
      keyPrefix: 'discover_rl',
      maxRequests: 60,
      windowSeconds: 60 * 60
    }),
    checkGlobalBudget('discover', { maxRequests: 2000, windowSeconds: 60 * 60 })
  ])
  if (!allowed || !withinGlobal) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' })
  }

  const type = firstParam(req.query.type) === 'tv' ? 'tv' : 'movie'
  const company = firstParam(req.query.company) || ''
  const network = firstParam(req.query.network) || ''
  const category = firstParam(req.query.category) || ''
  const genre = firstParam(req.query.genre) || ''
  const provider = firstParam(req.query.provider) || ''
  const regionParam = firstParam(req.query.region) || 'US'
  const region = REGION_RE.test(regionParam) ? regionParam : 'US'
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(firstParam(req.query.page) || '1', 10) || 1))

  if (company && !ID_RE.test(company)) return res.status(400).json({ message: 'Invalid company id' })
  if (network && !ID_RE.test(network)) return res.status(400).json({ message: 'Invalid network id' })

  const isTv = type === 'tv'
  const categories = isTv ? tvCategories : movieCategories
  const genres = isTv ? tvGenres : movieGenres
  if (category && !categories[category]) return res.status(400).json({ message: 'Unknown category' })
  if (genre && !genres[genre]) return res.status(400).json({ message: 'Unknown genre' })
  if (provider && !streamingProviders[provider]) return res.status(400).json({ message: 'Unknown provider' })
  if (!company && !network && !category && !genre && !provider) {
    return res.status(400).json({ message: 'Missing filter' })
  }

  try {
    let results: TitleSummary[] = []
    let totalPages = 1

    if (company) {
      // Matches OrgPage's raw queries — company feeds are movies by popularity,
      // network feeds are shows by vote count.
      const data = await fetchTmdb<TmdbPaged<TmdbMovie>>(
        '/discover/movie',
        { page, include_adult: 'false', sort_by: 'popularity.desc', with_companies: company }
      )
      totalPages = data.total_pages || 1
      results = (data.results || []).filter(hasPoster)
    } else if (network) {
      const data = await fetchTmdb<TmdbPaged<TmdbTvShow>>(
        '/discover/tv',
        { page, include_adult: 'false', sort_by: 'vote_count.desc', 'vote_count.gte': 100, with_networks: network }
      )
      totalPages = data.total_pages || 1
      results = (data.results || []).filter(hasPoster).map(normalizeTvTitle)
    } else {
      const data = isTv
        ? await fetchDiscoverTv({
            category: category || undefined,
            genreId: genre ? genres[genre].id : undefined,
            providerId: provider ? getProviderIds(provider, region).join('|') : null,
            region,
            page
          })
        : await fetchDiscoverMovies({
            category: category || undefined,
            genreId: genre ? genres[genre].id : undefined,
            providerId: provider ? getProviderIds(provider, region).join('|') : null,
            region,
            page
          })
      totalPages = data.total_pages || 1
      results = (data.results || []) as TitleSummary[]
    }

    setApiCache(res, 1800, 3600, { cdn: true })
    return res.status(200).json({ results, total_pages: totalPages, page })
  } catch (error) {
    console.error('discover error:', error)
    return res.status(502).json({ message: 'Title data is temporarily unavailable' })
  }
}
