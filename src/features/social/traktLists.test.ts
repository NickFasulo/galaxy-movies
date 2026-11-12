import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { maintainTraktLists, brandAccessToken } from './traktLists'

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  refreshTokens: vi.fn(),
  getProviderChanges: vi.fn(),
  getMonthlyChanges: vi.fn(),
  fetch: vi.fn<(url: string, init?: { method?: string; body?: string }) => Promise<unknown>>()
}))

vi.mock('../../lib/redis', () => ({ getRedis: mocks.getRedis }))
vi.mock('../billing/trakt', () => ({
  refreshTokens: mocks.refreshTokens,
  TRAKT_API: 'https://api.trakt.tv',
  TRAKT_UA: 'test-ua'
}))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: mocks.getProviderChanges,
  getMonthlyChanges: mocks.getMonthlyChanges
}))
vi.mock('./socialBroadcast', () => ({
  BROADCAST_PROVIDERS: ['netflix', 'hulu'],
  providerLabel: (k: string) => (k === 'netflix' ? 'Netflix' : 'Hulu')
}))
vi.stubGlobal('fetch', mocks.fetch)

const kv = {
  hget: vi.fn(async (): Promise<{ refreshToken: string; redirectUri: string } | null> => null),
  hset: vi.fn(async () => 1)
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status = 500) => ({ ok: false, status, json: async () => ({}) })

interface Call {
  url: string
  method: string
  body?: { movies?: { ids: { tmdb: number } }[]; shows?: { ids: { tmdb: number } }[]; name?: string }
}

const calls: Call[] = []
let existingLists: { name: string; ids: { slug: string } }[] = []
let listItems: Record<string, unknown[]> = {}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const addedOf = (tmdbId: number, tmdbType: 'movie' | 'tv', popularity = 1) => ({
  tmdbId,
  tmdbType,
  title: `T${tmdbId}`,
  year: 2025,
  popularity
})

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  existingLists = []
  listItems = {}
  process.env.TRAKT_CLIENT_ID = 'cid'
  process.env.TRAKT_BRAND_REFRESH_TOKEN = 'rt1'

  mocks.getRedis.mockReturnValue(kv)
  kv.hget.mockResolvedValue(null)
  mocks.refreshTokens.mockResolvedValue({ access_token: 'at', refresh_token: 'rt2' })
  mocks.getProviderChanges.mockResolvedValue({
    netflix: { added: [addedOf(1, 'movie', 90), addedOf(2, 'tv', 80)], left: [], coming: [], leavingSoon: [] },
    hulu: { added: [addedOf(3, 'movie', 70)], left: [], coming: [], leavingSoon: [] }
  })
  mocks.getMonthlyChanges.mockResolvedValue({
    netflix: {
      departed: [{ ...addedOf(4, 'movie', 60), date: '2026-03-01' }],
      leavingSoon: [{ ...addedOf(5, 'tv', 50), date: '2026-03-30', season: null }]
    },
    hulu: { departed: [], leavingSoon: [] }
  })

  mocks.fetch.mockImplementation(async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    const u = String(url)
    if (u.endsWith('/users/me/lists') && method === 'GET') return ok(existingLists)
    if (u.endsWith('/users/me/lists') && method === 'POST') {
      const slug = slugify(body.name)
      existingLists.push({ name: body.name, ids: { slug } })
      return ok({ name: body.name, ids: { slug } })
    }
    if (u.endsWith('/items/remove')) return ok({ deleted: {} })
    const itemsMatch = u.match(/\/users\/me\/lists\/([^/]+)\/items$/)
    if (itemsMatch && method === 'GET') return ok(listItems[itemsMatch[1]] || [])
    if (itemsMatch && method === 'POST') return ok({ added: {} })
    return fail(404)
  })
})

afterEach(() => {
  delete process.env.TRAKT_BRAND_REFRESH_TOKEN
})

describe('maintainTraktLists', () => {
  it('creates per-provider and monthly lists with sorted items', async () => {
    const res = await maintainTraktLists()
    expect(res.error).toBeUndefined()
    expect(res.updated).toContain('New on Netflix this week')
    expect(res.updated).toContain('New on Hulu this week')
    expect(res.updated.some((n) => n.startsWith('Leaving Soon'))).toBe(true)

    const creates = calls.filter((c) => c.url.endsWith('/users/me/lists') && c.method === 'POST')
    expect(creates).toHaveLength(3)
    // Departures claim a list slot before providers — free-tier caps at 5.
    expect(creates[0].body?.name).toMatch(/^Leaving Soon \d{4}-\d{2}$/)

    const adds = calls.filter((c) => /\/items$/.test(c.url) && c.method === 'POST')
    const netflixAdd = adds.find((c) => c.url.includes('new-on-netflix-this-week'))
    expect(netflixAdd?.body?.movies).toEqual([{ ids: { tmdb: 1 } }])
    expect(netflixAdd?.body?.shows).toEqual([{ ids: { tmdb: 2 } }])
  })

  it('skips providers with no arrivals instead of publishing empty lists', async () => {
    mocks.getProviderChanges.mockResolvedValue({
      netflix: { added: [], left: [], coming: [], leavingSoon: [] },
      hulu: { added: [addedOf(3, 'movie', 70)], left: [], coming: [], leavingSoon: [] }
    })
    const res = await maintainTraktLists()
    expect(res.skipped).toContain('New on Netflix this week')
    expect(res.updated).toContain('New on Hulu this week')
    expect(calls.filter((c) => c.body?.name === 'New on Netflix this week' && c.method === 'POST')).toHaveLength(0)
  })

  it('removes existing items before adding the new set', async () => {
    existingLists = [{ name: 'New on Netflix this week', ids: { slug: 'new-on-netflix-this-week' } }]
    listItems['new-on-netflix-this-week'] = [
      { type: 'movie', movie: { ids: { tmdb: 99 } } },
      { type: 'show', show: { ids: { tmdb: 98 } } }
    ]
    await maintainTraktLists()

    const listCalls = calls.filter((c) => c.url.includes('new-on-netflix-this-week'))
    const removeIdx = listCalls.findIndex((c) => c.url.endsWith('/items/remove'))
    const addIdx = listCalls.findIndex((c) => c.url.endsWith('/items') && c.method === 'POST')
    expect(removeIdx).toBeGreaterThanOrEqual(0)
    expect(addIdx).toBeGreaterThan(removeIdx)
    expect(listCalls[removeIdx].body?.movies).toEqual([{ ids: { tmdb: 99 } }])
    expect(listCalls[removeIdx].body?.shows).toEqual([{ ids: { tmdb: 98 } }])
    // Existing list reused by name — no second create call.
    expect(calls.filter((c) => c.body?.name === 'New on Netflix this week')).toHaveLength(0)
  })

  it('caps lists at 50 by popularity and dedupes monthly departures', async () => {
    mocks.getProviderChanges.mockResolvedValue({
      netflix: { added: Array.from({ length: 60 }, (_, i) => addedOf(i + 1, 'movie', i)), left: [], coming: [], leavingSoon: [] },
      hulu: { added: [], left: [], coming: [], leavingSoon: [] }
    })
    const dup = { ...addedOf(7, 'movie', 42), date: '2026-03-05' }
    mocks.getMonthlyChanges.mockResolvedValue({
      netflix: { departed: [dup], leavingSoon: [{ ...addedOf(7, 'movie', 42), date: '2026-03-20', season: null }] },
      hulu: { departed: [], leavingSoon: [] }
    })
    await maintainTraktLists()

    const netflixAdd = calls.find((c) => c.url.includes('new-on-netflix') && c.url.endsWith('/items') && c.method === 'POST')
    expect(netflixAdd?.body?.movies).toHaveLength(50)
    expect(netflixAdd?.body?.movies?.[0].ids.tmdb).toBe(60) // highest popularity first

    const leavingAdd = calls.find((c) => c.url.includes('leaving-soon') && c.url.endsWith('/items') && c.method === 'POST')
    const total = (leavingAdd?.body?.movies?.length || 0) + (leavingAdd?.body?.shows?.length || 0)
    expect(total).toBe(1)
  })
})

describe('brandAccessToken', () => {
  it('reports not_configured without env or stored token', async () => {
    delete process.env.TRAKT_BRAND_REFRESH_TOKEN
    const res = await brandAccessToken()
    expect(res).toEqual({ error: 'not_configured' })
    const summary = await maintainTraktLists()
    expect(summary.error).toBe('TRAKT_BRAND_REFRESH_TOKEN not configured')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('persists the rotated refresh token back to Redis', async () => {
    const res = await brandAccessToken()
    expect(res).toEqual({ token: 'at' })
    expect(kv.hset).toHaveBeenCalledWith('gm:trakt:brand', {
      creds: { refreshToken: 'rt2', redirectUri: 'urn:ietf:wg:oauth:2.0:oob' }
    })
  })

  it('prefers the stored token over the env bootstrap', async () => {
    kv.hget.mockResolvedValue({ refreshToken: 'stored-rt', redirectUri: 'urn:x' })
    await brandAccessToken()
    expect(mocks.refreshTokens).toHaveBeenCalledWith('stored-rt', 'urn:x')
  })

  it('reports unavailable when refresh fails', async () => {
    mocks.refreshTokens.mockResolvedValue(null)
    const res = await brandAccessToken()
    expect(res).toEqual({ error: 'unavailable' })
  })
})
