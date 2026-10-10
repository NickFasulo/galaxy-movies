import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

const getRedis = vi.hoisted(() => vi.fn((): unknown => null))
vi.mock('../../utils/redis', () => ({ getRedis }))

const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
let handler: Handler

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
let ipSeq = 0
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`

type Query = Record<string, string | string[]>

function makeReq(query: Query = {}, opts: { method?: string; ua?: string; ip?: string } = {}): NextApiRequest {
  const ip = opts.ip ?? nextIp()
  return {
    method: opts.method ?? 'GET',
    headers: { 'user-agent': opts.ua ?? UA, 'x-forwarded-for': ip },
    query,
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    jsonBody: undefined as unknown,
    setHeader(name: string, value: string | string[]) {
      res.headers[name] = value
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload
      return res
    },
    end() {
      return res
    }
  }
  return res as unknown as NextApiResponse & { statusCode: number; headers: Record<string, string | string[]>; jsonBody: unknown }
}

const tmdbPage = (results: unknown[], over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ page: 1, results, total_pages: 5, total_results: 100, ...over })
})

const movie = (over: Record<string, unknown> = {}) => ({ id: 1, title: 'Film', poster_path: '/p.jpg', release_date: '2024-06-01', ...over })
const show = (over: Record<string, unknown> = {}) => ({ id: 2, name: 'Show', poster_path: '/p.jpg', first_air_date: '2024-03-01', ...over })

const calledUrl = (): URL => new URL(fetchMock.mock.calls[0][0] as string)

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('TMDB_API_KEY', 'test-key')
  getRedis.mockReturnValue(null)
  fetchMock.mockResolvedValue(tmdbPage([]))
  handler = (await import('../../pages/api/allMovies')).default
})

describe('request gating', () => {
  it('rejects non-GET methods with 405 and Allow header', async () => {
    const res = makeRes()
    await handler(makeReq({}, { method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers['Allow']).toEqual(['GET'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([{ ua: 'curl/8.0' }, { ua: 'AhrefsBot/7.0' }, { ua: undefined }])('rejects bot ua=%o with 403', async ({ ua }) => {
    const res = makeRes()
    const req = makeReq()
    req.headers['user-agent'] = ua as string
    await handler(req, res)
    expect(res.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['bad media', { media: 'person' }],
    ['bad category', { category: 'not_a_genre' }],
    ['case-sensitive media', { media: 'Movie' }],
    ['case-sensitive category', { category: 'Action' }]
  ])('returns 400 for %s', async (_label, query) => {
    const res = makeRes()
    await handler(makeReq(query), res)
    expect(res.statusCode).toBe(400)
    expect(res.jsonBody).toEqual({ message: 'Invalid category or media type' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates category even when media routes elsewhere', async () => {
    const res = makeRes()
    await handler(makeReq({ media: 'tv', category: 'bogus' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('validates params even in search mode', async () => {
    const res = makeRes()
    await handler(makeReq({ search: 'dune', category: 'bogus' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 500 when the TMDB key is missing', async () => {
    vi.stubEnv('TMDB_API_KEY', '')
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
    expect(res.jsonBody).toEqual({ message: 'TMDB API key is missing' })
  })

  it('returns 429 with Retry-After after 50 requests/hour per IP', async () => {
    const ip = '192.0.2.77'
    for (let i = 0; i < 50; i++) {
      const res = makeRes()
      await handler(makeReq({ search: `q${i}` }, { ip }), res)
      expect(res.statusCode).toBe(200)
    }
    const res = makeRes()
    await handler(makeReq({ search: 'over' }, { ip }), res)
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('3600')
    expect(fetchMock).toHaveBeenCalledTimes(50)
  })
})

describe('search routing', () => {
  it('defaults to /search/movie for a movie search', async () => {
    await handler(makeReq({ search: 'batman' }), makeRes())
    const url = calledUrl()
    expect(url.pathname).toBe('/3/search/movie')
    expect(url.searchParams.get('query')).toBe('batman')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('include_adult')).toBe('false')
    expect(url.searchParams.get('api_key')).toBe('test-key')
  })

  it('routes media=tv searches to /search/tv', async () => {
    await handler(makeReq({ search: 'severance', media: 'tv' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/search/tv')
  })

  it('routes media=trending searches to /search/multi', async () => {
    await handler(makeReq({ search: 'dune', media: 'trending' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/search/multi')
  })

  it('ignores category for routing when a search term is present', async () => {
    await handler(makeReq({ search: 'dune', category: 'action' }), makeRes())
    const url = calledUrl()
    expect(url.pathname).toBe('/3/search/movie')
    expect(url.searchParams.has('with_genres')).toBe(false)
  })

  it('truncates the search term to 100 chars', async () => {
    await handler(makeReq({ search: 'x'.repeat(150) }), makeRes())
    expect(calledUrl().searchParams.get('query')).toHaveLength(100)
  })

  it('URL-encodes special characters in the query', async () => {
    await handler(makeReq({ search: 'a&b=c?d' }), makeRes())
    expect(calledUrl().searchParams.get('query')).toBe('a&b=c?d')
  })

  it('sends the untrimmed search string to TMDB', async () => {
    await handler(makeReq({ search: ' batman ' }), makeRes())
    expect(calledUrl().searchParams.get('query')).toBe(' batman ')
  })

  it('treats a whitespace-only search as a browse request', async () => {
    await handler(makeReq({ search: '   ' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/discover/movie')
  })

  it('uses the first entry of an array-valued param', async () => {
    await handler(makeReq({ search: ['first', 'second'] }), makeRes())
    expect(calledUrl().searchParams.get('query')).toBe('first')
  })
})

describe('browse routing', () => {
  it('defaults to popular movies discover', async () => {
    await handler(makeReq(), makeRes())
    const url = calledUrl()
    expect(url.pathname).toBe('/3/discover/movie')
    expect(url.searchParams.get('sort_by')).toBe('popularity.desc')
    expect(url.searchParams.get('primary_release_date.gte')).toBe(`${new Date().getFullYear() - 3}-01-01`)
  })

  it('routes media=tv to discover/tv', async () => {
    await handler(makeReq({ media: 'tv' }), makeRes())
    const url = calledUrl()
    expect(url.pathname).toBe('/3/discover/tv')
    expect(url.searchParams.get('vote_count.gte')).toBe('10')
  })

  it('routes media=trending to trending/all/week', async () => {
    await handler(makeReq({ media: 'trending' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/trending/all/week')
  })

  it.each([
    ['action', '28'],
    ['comedy', '35'],
    ['sci_fi', '878'],
    ['horror', '27']
  ])('routes genre category %s with_genres=%s', async (category, genreId) => {
    await handler(makeReq({ category }), makeRes())
    const url = calledUrl()
    expect(url.pathname).toBe('/3/discover/movie')
    expect(url.searchParams.get('with_genres')).toBe(genreId)
    expect(url.searchParams.get('sort_by')).toBe('primary_release_date.desc')
    expect(url.searchParams.get('primary_release_date.lte')).toBe(new Date().toISOString().split('T')[0])
  })

  it('routes now_playing with a 90-day release window', async () => {
    await handler(makeReq({ category: 'now_playing' }), makeRes())
    const url = calledUrl()
    const gte = url.searchParams.get('primary_release_date.gte')!
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    expect(gte).toBe(cutoff.toISOString().split('T')[0])
    expect(url.searchParams.get('primary_release_date.lte')).toBe(new Date().toISOString().split('T')[0])
  })

  it('routes upcoming with a future release floor', async () => {
    await handler(makeReq({ category: 'upcoming' }), makeRes())
    expect(calledUrl().searchParams.get('primary_release_date.gte')).toBe(new Date().toISOString().split('T')[0])
  })

  it('routes top_rated to the /movie/{category} endpoint', async () => {
    await handler(makeReq({ category: 'top_rated' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/movie/top_rated')
  })
})

describe('page param', () => {
  it.each([
    ['3', '3'],
    ['abc', '1'],
    ['0', '1'],
    ['-4', '1'],
    ['2.9', '2'],
    ['9999', '500']
  ])('page=%s becomes page=%s', async (page, expected) => {
    await handler(makeReq({ page }), makeRes())
    expect(calledUrl().searchParams.get('page')).toBe(expected)
  })
})

describe('movie response filtering', () => {
  it('drops results without a poster', async () => {
    fetchMock.mockResolvedValue(tmdbPage([movie(), movie({ id: 9, poster_path: null })]))
    const res = makeRes()
    await handler(makeReq(), res)
    const body = res.jsonBody as { results: Array<{ id: number }>; total_pages: number }
    expect(body.results.map((r) => r.id)).toEqual([1])
    expect(body.total_pages).toBe(5)
  })

  it('keeps any poster in search mode regardless of year', async () => {
    fetchMock.mockResolvedValue(tmdbPage([movie({ id: 1, release_date: '1985-01-01' })]))
    const res = makeRes()
    await handler(makeReq({ search: 'old' }), res)
    expect((res.jsonBody as { results: unknown[] }).results).toHaveLength(1)
  })

  it('filters out pre-cutoff releases in popular', async () => {
    fetchMock.mockResolvedValue(
      tmdbPage([movie({ id: 1, release_date: '2001-06-01' }), movie({ id: 2, release_date: '2999-06-01' })])
    )
    const res = makeRes()
    await handler(makeReq({ category: 'popular' }), res)
    const body = res.jsonBody as { results: Array<{ id: number }> }
    expect(body.results.map((r) => r.id)).toEqual([2])
  })

  it('keeps popular results with a missing release_date', async () => {
    fetchMock.mockResolvedValue(tmdbPage([movie({ release_date: undefined })]))
    const res = makeRes()
    await handler(makeReq({ category: 'popular' }), res)
    expect((res.jsonBody as { results: unknown[] }).results).toHaveLength(1)
  })

  it('filters out already-released titles in upcoming', async () => {
    fetchMock.mockResolvedValue(
      tmdbPage([movie({ id: 1, release_date: '2000-01-01' }), movie({ id: 2, release_date: '2999-01-01' })])
    )
    const res = makeRes()
    await handler(makeReq({ category: 'upcoming' }), res)
    expect((res.jsonBody as { results: Array<{ id: number }> }).results.map((r) => r.id)).toEqual([2])
  })
})

describe('tv/trending response normalization', () => {
  it('normalizes tv results via normalizeTvTitle', async () => {
    fetchMock.mockResolvedValue(tmdbPage([show()]))
    const res = makeRes()
    await handler(makeReq({ media: 'tv' }), res)
    const [item] = (res.jsonBody as { results: Array<Record<string, unknown>> }).results
    expect(item).toMatchObject({ title: 'Show', release_date: '2024-03-01', mediaType: 'tv' })
  })

  it('tags movie results in a multi/trending feed with mediaType movie', async () => {
    fetchMock.mockResolvedValue(tmdbPage([{ ...movie(), media_type: 'movie' }]))
    const res = makeRes()
    await handler(makeReq({ media: 'trending' }), res)
    const [item] = (res.jsonBody as { results: Array<Record<string, unknown>> }).results
    expect(item.mediaType).toBe('movie')
  })

  it('drops non-movie/tv media types and missing posters', async () => {
    fetchMock.mockResolvedValue(
      tmdbPage([
        { ...movie(), media_type: 'movie' },
        { id: 5, media_type: 'person', name: 'Actor', poster_path: '/a.jpg' },
        { ...show({ id: 6 }), media_type: 'tv', poster_path: null }
      ])
    )
    const res = makeRes()
    await handler(makeReq({ media: 'trending' }), res)
    expect((res.jsonBody as { results: unknown[] }).results).toHaveLength(1)
  })
})

describe('TMDB failure handling', () => {
  it('maps a TMDB 401 to a 502 with a key-specific message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(502)
    expect(res.jsonBody).toEqual({ message: 'TMDB rejected the configured API key' })
  })

  it.each([404, 429, 500])('passes through TMDB status %s', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(status)
    expect(res.jsonBody).toEqual({ message: 'TMDB API fetch failed' })
  })

  it('returns 500 when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
    expect(res.jsonBody).toEqual({ message: 'Internal Server Error' })
  })
})

describe('cache headers', () => {
  it('sets CDN-friendly cache headers on success', async () => {
    const res = makeRes()
    await handler(makeReq(), res)
    const expected = 'public, s-maxage=1800, stale-while-revalidate=3600'
    expect(res.headers['Cache-Control']).toBe(expected)
    expect(res.headers['Vercel-CDN-Cache-Control']).toBe(expected)
  })
})

describe('edge case inputs', () => {
  it('passes unicode queries through to TMDB', async () => {
    await handler(makeReq({ search: 'ドゥーン 砂の惑星' }), makeRes())
    expect(calledUrl().searchParams.get('query')).toBe('ドゥーン 砂の惑星')
  })

  it('encodes newlines and quotes inside the query', async () => {
    await handler(makeReq({ search: 'a\nb"c' }), makeRes())
    const url = calledUrl()
    expect(url.searchParams.get('query')).toBe('a\nb"c')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('\n')
  })

  it('cannot smuggle extra params via the search value', async () => {
    await handler(makeReq({ search: 'x&page=99&include_adult=true' }), makeRes())
    const url = calledUrl()
    expect(url.searchParams.get('query')).toBe('x&page=99&include_adult=true')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('include_adult')).toBe('false')
  })

  it.each([
    ['0x10', '1'],
    [' 3 ', '3'],
    ['1e3', '1'],
    ['+2', '2'],
    ['05', '5']
  ])('page=%s becomes page=%s', async (page, expected) => {
    await handler(makeReq({ page }), makeRes())
    expect(calledUrl().searchParams.get('page')).toBe(expected)
  })

  it.each([
    ['empty media', { media: '' }, '/3/discover/movie'],
    ['empty category', { category: '' }, '/3/discover/movie']
  ])('falls back to defaults for %s', async (_label, query, path) => {
    await handler(makeReq(query), makeRes())
    expect(calledUrl().pathname).toBe(path)
  })

  it('uses the first entry of an array-valued media param', async () => {
    await handler(makeReq({ media: ['tv', 'movie'] }), makeRes())
    expect(calledUrl().pathname).toBe('/3/discover/tv')
  })

  it('search routing wins over a valid category', async () => {
    await handler(makeReq({ search: 'dune', category: 'action' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/search/movie')
  })

  it('ignores a valid-but-irrelevant category for media=tv', async () => {
    await handler(makeReq({ media: 'tv', category: 'action' }), makeRes())
    expect(calledUrl().pathname).toBe('/3/discover/tv')
  })

  it('handles a 100-char search at the boundary', async () => {
    await handler(makeReq({ search: 'y'.repeat(100) }), makeRes())
    expect(calledUrl().searchParams.get('query')).toHaveLength(100)
  })

  it('returns empty results when TMDB has no results array', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ page: 1, total_pages: 0, total_results: 0 }) })
    const res = makeRes()
    await handler(makeReq(), res)
    expect((res.jsonBody as { results: unknown[] }).results).toEqual([])
  })

  it('returns 500 when TMDB results is not an array', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: { weird: true } }) })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
    expect(res.jsonBody).toEqual({ message: 'Internal Server Error' })
  })

  it('returns 500 when the TMDB body is not JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('invalid json') } })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
  })

  it('drops non-object entries from results', async () => {
    fetchMock.mockResolvedValue(tmdbPage(['a string', 42, null, movie()]))
    const res = makeRes()
    await handler(makeReq(), res)
    expect((res.jsonBody as { results: unknown[] }).results).toHaveLength(1)
  })
})
