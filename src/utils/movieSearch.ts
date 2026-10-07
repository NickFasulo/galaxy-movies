import { fetchTmdb } from './tmdb'
import type { Genre, TitleSummary, TmdbMovie, TmdbPaged } from '../types/tmdb'

type MultiSearchResult = TitleSummary & {
  media_type: string
  original_title?: string
  original_name?: string
}

export interface MovieMention {
  match: string
  title: string
  year?: string
  quoted: boolean
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

// The prompt asks for "Title (YYYY)", but match loosely: quotes optional when
// a year is present, curly quotes accepted, quoted title alone as fallback.
// Title capture groups are 1, 3, 5, 7 in alternation order — only group 5
// (bare Title (YYYY)) is unquoted. Non-year forms must start uppercase/digit
// so lowercase quoted prose ("feel-good") doesn't linkify.
const TITLE_MENTION_PATTERN =
  /["“]([^"“”\n]{1,80}?)\s\((\d{4})\)["”]|["“]([\p{Lu}\p{N}][^"“”()\n]{1,79})["”]\s?\((\d{4})\)|([\p{Lu}\p{N}][^\n"“”()]{1,79}?)\s\((\d{4})\)|["“]([\p{Lu}\p{N}][^"“”()\n]{1,79})["”]/gu

export function extractTitleMentions(text: string | null | undefined, maxMentions = 5): MovieMention[] {
  if (!text) return []

  const seen = new Set<string>()
  const mentions: MovieMention[] = []
  let match: RegExpExecArray | null

  TITLE_MENTION_PATTERN.lastIndex = 0
  while ((match = TITLE_MENTION_PATTERN.exec(text)) !== null) {
    const [fullMatch] = match
    const title = (match[1] ?? match[3] ?? match[5] ?? match[7] ?? '').trim()
    const year = match[2] ?? match[4] ?? match[6]
    if (!title) continue
    const key = `${title.toLowerCase()}|${year || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    mentions.push({ match: fullMatch, title, year, quoted: match[5] === undefined })
    if (mentions.length >= maxMentions) break
  }

  return mentions
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const titleYear = (item: MultiSearchResult) => item.release_date || item.first_air_date || ''

export async function resolveMovieMentions(mentions: MovieMention[]): Promise<ResolvedMention[]> {
  const resolved = await Promise.all(
    mentions.map(async (mention): Promise<ResolvedMention | null> => {
      try {
        const results = await searchMultiByQuery(mention.title, 1)
        const want = normalizeTitle(mention.title)
        const sameTitle = results.filter((item) =>
          [item.title, item.name, item.original_title, item.original_name].some(
            (t) => t !== undefined && normalizeTitle(t) === want
          )
        )
        // Unquoted mentions need a real title match — otherwise a phrase like
        // "it in June (2020)" would link to whatever TMDB returns for it.
        const bestMatch =
          sameTitle.find((item) => mention.year !== undefined && titleYear(item).startsWith(mention.year)) ||
          sameTitle[0] ||
          (mention.quoted
            ? results.find((item) => mention.year !== undefined && titleYear(item).startsWith(mention.year)) ?? results[0]
            : null)

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
