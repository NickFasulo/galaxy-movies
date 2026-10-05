import { fetchTmdb } from './tmdb'
import type { Genre, TitleSummary, TmdbMovie, TmdbPaged } from '../types/tmdb'

type MultiSearchResult = TitleSummary & { media_type: string }

export interface MovieMention {
  match: string
  title: string
  year: string
}

export interface ResolvedMention {
  match: string
  movieId: number
  mediaType: string
}

async function searchMultiByQuery(query: string, page = 1): Promise<MultiSearchResult[]> {
  try {
    const data = await fetchTmdb<TmdbPaged<MultiSearchResult>>('/search/multi', {
      query,
      page,
      include_adult: false
    })

    return (data.results || []).filter(
      (item) => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
    )
  } catch (error) {
    console.error('Error searching titles:', error)
    return []
  }
}

export async function getRecentReleases(page = 1): Promise<{ results: TmdbMovie[]; total_pages: number; total_results: number }> {
  try {
    const now = new Date()
    const ninetyDaysAgo = new Date(now)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const data = await fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', {
      page,
      include_adult: false,
      sort_by: 'popularity.desc',
      'vote_count.gte': 10,
      'primary_release_date.gte': ninetyDaysAgo.toISOString().split('T')[0],
      'primary_release_date.lte': now.toISOString().split('T')[0]
    })

    return {
      results: (data.results || []).filter(movie => movie.poster_path),
      total_pages: data.total_pages,
      total_results: data.total_results
    }
  } catch (error) {
    console.error('Error getting recent releases:', error)
    return { results: [], total_pages: 0, total_results: 0 }
  }
}

export function formatMovieForChat(movie: TmdbMovie & { genres?: Genre[] }) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A',
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
    overview: movie.overview?.substring(0, 200) + ((movie.overview?.length ?? 0) > 200 ? '...' : ''),
    genres: movie.genres?.map(g => g.name).join(', ') || 'N/A'
  }
}

const QUOTED_TITLE_PATTERN = /"([^"]+?)\s\((\d{4})\)"/g

export function extractQuotedMovieMentions(text: string | null | undefined, maxMentions = 5): MovieMention[] {
  if (!text) return []

  const seen = new Set<string>()
  const mentions: MovieMention[] = []
  let match: RegExpExecArray | null

  while ((match = QUOTED_TITLE_PATTERN.exec(text)) !== null) {
    const [fullMatch, title, year] = match
    const key = `${title.trim().toLowerCase()}|${year}`
    if (seen.has(key)) continue
    seen.add(key)
    mentions.push({ match: fullMatch, title: title.trim(), year })
    if (mentions.length >= maxMentions) break
  }

  return mentions
}

export async function resolveMovieMentions(mentions: MovieMention[]): Promise<ResolvedMention[]> {
  const resolved = await Promise.all(
    mentions.map(async (mention): Promise<ResolvedMention | null> => {
      try {
        const results = await searchMultiByQuery(mention.title, 1)
        const bestMatch = results.find((item) => {
          const date = item.release_date || item.first_air_date
          return date && date.startsWith(mention.year)
        }) || results[0]

        return bestMatch
          ? { match: mention.match, movieId: bestMatch.id, mediaType: bestMatch.media_type }
          : null
      } catch (error) {
        console.error(`Error resolving title mention "${mention.title}":`, error)
        return null
      }
    })
  )

  return resolved.filter((mention): mention is ResolvedMention => Boolean(mention))
}
