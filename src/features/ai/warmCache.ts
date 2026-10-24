import { fetchTmdb, normalizeTvTitle } from '../catalog/tmdb'
import { getOrGenerateMovieReview } from './movieReview'
import { getOrGenerateSimilarMovies, type SimilarCandidate } from '../catalog/similarMovies'
import type { MediaType, TmdbMovie, TmdbTvShow } from '../../types/tmdb'

// SSR only generates AI content for requests carrying a referer or a
// search-engine UA — so the crawlable surface's hot titles get warmed here,
// once a day, by the streaming-changes cron. Fill-only: cache hits cost one
// Redis GET each and miss the OpenAI call entirely.
const WARM_MAX_TITLES = 60
// A title releasing within this window outranks hotter titles whose spike
// already passed — release-day queries are the proven traffic pattern.
const URGENT_RELEASE_DAYS = 14
const WARM_BUDGET = { key: 'ai_warm', maxRequests: 200, windowSeconds: 60 * 60 }

interface WarmDetail {
  overview?: string
  genres?: { name: string }[]
  recommendations?: { results?: (TmdbMovie | TmdbTvShow)[] }
}

export interface WarmCandidate {
  id: number
  mediaType: MediaType
  title: string
  popularity?: number
  // Days until release, when the candidate is an upcoming title — drives the
  // urgent-first sort so the queue front-runs demand instead of chasing it.
  releasesWithinDays?: number
}

export async function warmAiTitleCache(candidates: WarmCandidate[]): Promise<number> {
  const seen = new Set<string>()
  const byPopularity = (a: WarmCandidate, b: WarmCandidate) => (b.popularity ?? 0) - (a.popularity ?? 0)
  const unique = candidates
    .filter((c) => c.id && c.title && !seen.has(`${c.mediaType}:${c.id}`) && seen.add(`${c.mediaType}:${c.id}`))
  const urgent = unique.filter(c => (c.releasesWithinDays ?? Infinity) <= URGENT_RELEASE_DAYS).sort(byPopularity)
  const rest = unique.filter(c => (c.releasesWithinDays ?? Infinity) > URGENT_RELEASE_DAYS).sort(byPopularity)
  const ordered = [...urgent, ...rest].slice(0, WARM_MAX_TITLES)

  let warmed = 0
  for (const c of ordered) {
    try {
      const detail = await fetchTmdb<WarmDetail>(`/${c.mediaType}/${c.id}`, { append_to_response: 'recommendations' })
      if (!detail?.overview) continue
      const genres = detail.genres?.map((g) => g.name) || []

      const review = await getOrGenerateMovieReview({
        movieId: c.id,
        title: c.title,
        overview: detail.overview,
        genres,
        mediaType: c.mediaType,
        budget: WARM_BUDGET
      })
      if (review) warmed++

      const recs: SimilarCandidate[] = (detail.recommendations?.results || [])
        .filter((r) => r?.id && r.poster_path && r.id !== c.id)
        .map((r) => c.mediaType === 'tv' ? normalizeTvTitle(r as TmdbTvShow) : r as TmdbMovie)
      if (recs.length) {
        await getOrGenerateSimilarMovies({
          movieId: c.id,
          title: c.title,
          overview: detail.overview,
          genres,
          candidates: recs,
          mediaType: c.mediaType,
          budget: WARM_BUDGET
        })
      }
    } catch (err) {
      console.error(`AI cache warm failed for ${c.mediaType}:${c.id}:`, err)
    }
  }
  return warmed
}
