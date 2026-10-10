import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MovieMention } from './movieSearch'

const fetchTmdb = vi.hoisted(() => vi.fn())
vi.mock('./tmdb', () => ({ fetchTmdb }))

const mention = (over: Partial<MovieMention> = {}): MovieMention => ({
  match: '"Heat (1995)"',
  title: 'Heat',
  year: '1995',
  quoted: true,
  ...over
})

const tmdbHit = (over: Record<string, unknown> = {}) => ({
  id: 949,
  media_type: 'movie',
  title: 'Heat',
  release_date: '1995-12-15',
  poster_path: '/p.jpg',
  ...over
})

const multiPage = (results: unknown[]) => ({ results, total_pages: 1, total_results: results.length })

let extractTitleMentions: typeof import('./movieSearch').extractTitleMentions
let resolveMovieMentions: typeof import('./movieSearch').resolveMovieMentions
let getRecentReleases: typeof import('./movieSearch').getRecentReleases
let getRecentShows: typeof import('./movieSearch').getRecentShows
let formatMovieForChat: typeof import('./movieSearch').formatMovieForChat
let formatShowForChat: typeof import('./movieSearch').formatShowForChat

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  fetchTmdb.mockResolvedValue(multiPage([]))
  const mod = await import('./movieSearch')
  extractTitleMentions = mod.extractTitleMentions
  resolveMovieMentions = mod.resolveMovieMentions
  getRecentReleases = mod.getRecentReleases
  getRecentShows = mod.getRecentShows
  formatMovieForChat = mod.formatMovieForChat
  formatShowForChat = mod.formatShowForChat
})

describe('extractTitleMentions', () => {
  it.each([
    ['straight quotes', '"Heat (1995)"', 'Heat', '1995'],
    ['curly quotes', '“Heat (1995)”', 'Heat', '1995'],
    ['quoted title + bare year', '"Heat" (1995)', 'Heat', '1995'],
    ['bare title + year', 'Heat (1995)', 'Heat', '1995'],
    ['title with punctuation', '"Spider-Man: No Way Home (2021)"', 'Spider-Man: No Way Home', '2021'],
    ['year-less quoted title', '"Severance"', 'Severance', undefined]
  ])('extracts %s', (_label, text, title, year) => {
    const [m] = extractTitleMentions(text)
    expect(m).toMatchObject({ title, year })
  })

  it('marks bare Title (YYYY) matches as unquoted', () => {
    const [m] = extractTitleMentions('Heat (1995) is a classic')
    expect(m.quoted).toBe(false)
    expect(m.title).toBe('Heat')
    expect(m.year).toBe('1995')
  })

  it('captures bare matches greedily from the first uppercase char', () => {
    const [m] = extractTitleMentions('You should see Heat (1995) soon')
    expect(m).toMatchObject({ title: 'You should see Heat', year: '1995', quoted: false })
  })

  it('marks quoted matches as quoted', () => {
    const [m] = extractTitleMentions('"Heat (1995)" is great')
    expect(m.quoted).toBe(true)
    expect(m.match).toBe('"Heat (1995)"')
  })

  it('ignores lowercase quoted prose like "feel-good"', () => {
    expect(extractTitleMentions('a "feel-good" classic')).toHaveLength(0)
    expect(extractTitleMentions('a 「feel-good」 classic')).toHaveLength(0)
  })

  it.each([
    ['corner brackets', '「千と千尋の神隠し (2001)」', '千と千尋の神隠し', '2001'],
    ['double corner brackets', '『Dune (2021)』', 'Dune', '2021'],
    ['Chinese title marks', '《流浪地球 (2019)》', '流浪地球', '2019'],
    ['year-less CJK title', '「となりのトトロ」がおすすめ', 'となりのトトロ', undefined]
  ])('extracts %s', (_label, text, title, year) => {
    const [m] = extractTitleMentions(text)
    expect(m).toMatchObject({ title, year, quoted: true })
  })

  it('still loosely captures a bare mid-sentence Title (YYYY) for downstream filtering', () => {
    const [m] = extractTitleMentions('it in June (2020) maybe')
    expect(m).toMatchObject({ title: 'June', year: '2020', quoted: false })
  })

  it('dedupes repeated mentions of the same title+year', () => {
    const text = '"Heat (1995)" is better than "Heat (1995)"'
    expect(extractTitleMentions(text)).toHaveLength(1)
  })

  it('keeps the same title with different years distinct', () => {
    const text = '"Dune (1984)" vs "Dune (2021)"'
    const mentions = extractTitleMentions(text)
    expect(mentions.map((m) => m.year)).toEqual(['1984', '2021'])
  })

  it('caps extraction at 5 mentions', () => {
    const text = ['"A (2000)"', '"B (2001)"', '"C (2002)"', '"D (2003)"', '"E (2004)"', '"F (2005)"'].join(' ')
    expect(extractTitleMentions(text)).toHaveLength(5)
  })

  it('does not match a non-4-digit year', () => {
    expect(extractTitleMentions('"Heat (95)"')).toHaveLength(0)
    expect(extractTitleMentions('Heat (19950)')).toHaveLength(0)
  })

  it.each([null, undefined, ''])('returns [] for %s', (text) => {
    expect(extractTitleMentions(text)).toEqual([])
  })
})

describe('resolveMovieMentions', () => {
  it('resolves an exact title+year match to its TMDB id', async () => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit()]))
    const resolved = await resolveMovieMentions([mention()])
    expect(fetchTmdb).toHaveBeenCalledWith('/search/multi', expect.objectContaining({ query: 'Heat' }))
    expect(resolved).toEqual([{ match: '"Heat (1995)"', movieId: 949, mediaType: 'movie' }])
  })

  it('prefers the result whose release year matches the mention', async () => {
    fetchTmdb.mockResolvedValue(
      multiPage([
        tmdbHit({ id: 1, release_date: '1986-01-01' }),
        tmdbHit({ id: 2, release_date: '1995-06-01' })
      ])
    )
    const resolved = await resolveMovieMentions([mention()])
    expect(resolved[0].movieId).toBe(2)
  })

  it('falls back to the first result for quoted mentions without an exact title match', async () => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit({ id: 7, title: 'Heathers', release_date: '1988-01-01' })]))
    const resolved = await resolveMovieMentions([mention()])
    expect(resolved).toEqual([{ match: '"Heat (1995)"', movieId: 7, mediaType: 'movie' }])
  })

  it('refuses to link an unquoted mention with no exact title match', async () => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit({ title: 'Junebug', release_date: '2005-01-01' })]))
    const resolved = await resolveMovieMentions([mention({ match: 'June (2020)', title: 'June', year: '2020', quoted: false })])
    expect(resolved).toEqual([])
  })

  it('resolves a CJK title via original_title match', async () => {
    fetchTmdb.mockResolvedValue(
      multiPage([tmdbHit({ title: 'Spirited Away', original_title: '千と千尋の神隠し', release_date: '2001-07-20' })])
    )
    const resolved = await resolveMovieMentions([
      mention({ match: '「千と千尋の神隠し (2001)」', title: '千と千尋の神隠し', year: '2001' })
    ])
    expect(resolved).toEqual([{ match: '「千と千尋の神隠し (2001)」', movieId: 949, mediaType: 'movie' }])
  })

  it('matches titles via original_title/name too', async () => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit({ title: 'Different', original_title: 'Heat' })]))
    const resolved = await resolveMovieMentions([mention({ quoted: false, match: 'Heat (1995)' })])
    expect(resolved).toHaveLength(1)
  })

  it.each([
    ['a person result', { media_type: 'person', name: 'Some Actor' }],
    ['a result with no poster', { poster_path: null }]
  ])('drops %s from TMDB results', async (_label, over) => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit(over)]))
    const resolved = await resolveMovieMentions([mention()])
    expect(resolved).toEqual([])
  })

  it('passes tv results through with mediaType tv', async () => {
    fetchTmdb.mockResolvedValue(multiPage([tmdbHit({ media_type: 'tv', name: 'Heat', title: undefined, first_air_date: '1995-01-01' })]))
    const resolved = await resolveMovieMentions([mention()])
    expect(resolved[0].mediaType).toBe('tv')
  })

  it('returns [] when the search fails', async () => {
    fetchTmdb.mockRejectedValue(new Error('tmdb down'))
    expect(await resolveMovieMentions([mention()])).toEqual([])
  })
})

describe('recent releases', () => {
  it('queries TMDB discover with a 90-day window for movies', async () => {
    fetchTmdb.mockResolvedValue(multiPage([{ id: 1, poster_path: '/p.jpg' }]))
    const { results, total_results } = await getRecentReleases(1)
    expect(results).toHaveLength(1)
    expect(total_results).toBe(1)
    const [path, params] = fetchTmdb.mock.calls[0]
    expect(path).toBe('/discover/movie')
    expect(params['primary_release_date.gte']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(params['primary_release_date.lte']).toBe(new Date().toISOString().split('T')[0])
    expect(params['vote_count.gte']).toBe(10)
  })

  it('queries discover/tv with first_air_date params for shows', async () => {
    fetchTmdb.mockResolvedValue(multiPage([]))
    await getRecentShows(2)
    const [path, params] = fetchTmdb.mock.calls[0]
    expect(path).toBe('/discover/tv')
    expect(params['first_air_date.gte']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(params.page).toBe(2)
  })

  it('drops titles without posters', async () => {
    fetchTmdb.mockResolvedValue(multiPage([{ id: 1, poster_path: '/p.jpg' }, { id: 2, poster_path: null }]))
    const { results } = await getRecentReleases()
    expect(results).toEqual([{ id: 1, poster_path: '/p.jpg' }])
  })

  it('returns an empty page when TMDB fails', async () => {
    fetchTmdb.mockRejectedValue(new Error('down'))
    expect(await getRecentReleases()).toEqual({ results: [], total_pages: 0, total_results: 0 })
    expect(await getRecentShows()).toEqual({ results: [], total_pages: 0, total_results: 0 })
  })
})

describe('chat formatters', () => {
  it('formats a movie for the prompt context', () => {
    expect(
      formatMovieForChat({
        id: 1,
        title: 'Film',
        release_date: '1999-03-31',
        vote_average: 8.66,
        overview: 'Neo wakes up.',
        genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Sci-Fi' }]
      } as never)
    ).toEqual({ id: 1, title: 'Film', year: 1999, rating: '8.7', overview: 'Neo wakes up.', genres: 'Action, Sci-Fi' })
  })

  it('formats a show using name/first_air_date', () => {
    const result = formatShowForChat({ id: 2, name: 'Show', first_air_date: '2020-06-15', vote_average: 7.25, overview: 'x' } as never)
    expect(result).toMatchObject({ title: 'Show', year: 2020, rating: '7.3' })
  })

  it('falls back to N/A for missing fields', () => {
    const result = formatMovieForChat({ id: 3, title: 'Mystery' } as never)
    expect(result.year).toBe('N/A')
    expect(result.rating).toBe('N/A')
    expect(result.genres).toBe('N/A')
    expect(result.overview).toBe('')
  })

  it('truncates overviews at 200 chars with an ellipsis', () => {
    const overview = 'a'.repeat(250)
    expect(formatMovieForChat({ id: 4, overview } as never).overview).toBe('a'.repeat(200) + '...')
    expect(formatMovieForChat({ id: 4, overview: 'b'.repeat(200) } as never).overview).toHaveLength(200)
  })
})
