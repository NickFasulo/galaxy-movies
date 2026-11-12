import { describe, expect, it, vi, beforeEach } from 'vitest'
import handler from '../../pages/api/alerts-prefs'
import { SYNCKEY_KEY, ALERTS_PREFS_KEY, DISCORD_KEY } from '../../features/alerts/waitlistStore'
import { makeReq, makeRes } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1),
  kvHdel: vi.fn<(key: string, field: string) => Promise<number>>(async () => 1),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../lib/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, hset: mocks.kvHset, hdel: mocks.kvHdel, eval: mocks.kvEval })
}))

const SYNC_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const EMAIL = 'user@example.com'

const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  email: EMAIL,
  key: SYNC_KEY,
  watchlist: [{ id: 1, mediaType: 'movie', title: 'Film', poster_path: '/p.jpg', year: '2020' }],
  services: ['netflix'],
  region: 'US',
  ratings: [{ id: 2, mediaType: 'tv', title: 'Show', rating: 9, poster_path: null, year: null }],
  ...overrides
})

interface WrittenPrefs {
  watchlist: Record<string, unknown>[]
  ratings: Record<string, unknown>[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : null)
})

describe('POST /api/alerts-prefs', () => {
  it('stores watchlist, services, and ratings keyed by email', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody() }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as WrittenPrefs
    expect(written.watchlist[0]).toMatchObject({ id: 1, poster_path: '/p.jpg', year: '2020' })
    expect(written.ratings[0]).toMatchObject({ id: 2, mediaType: 'tv', rating: 9 })
    expect(mocks.kvHset.mock.calls[0]![0]).toBe(ALERTS_PREFS_KEY)
  })

  it('defaults a missing ratings array to empty for old clients', async () => {
    const body = validBody()
    delete body.ratings
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as WrittenPrefs
    expect(written.ratings).toEqual([])
  })

  it.each([
    { rating: 11 },
    { rating: 0 },
    { rating: 7.5 },
    { rating: 'high' },
    { mediaType: 'podcast', rating: 5 },
    { title: 'x'.repeat(301), rating: 5 }
  ])('rejects malformed rating %j', async (bad) => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody({ ratings: [{ id: 1, mediaType: 'movie', title: 'T', ...bad }] }) }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('stores watched entries with episode rollup fields and optional dates', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody({
      watched: [
        { id: 3, mediaType: 'tv', title: 'Show', watched_at: '2024-01-05', episodes: 62, lastEpisode: 'S5E16' },
        { id: 4, mediaType: 'movie', title: 'Film' }
      ]
    }) }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as WrittenPrefs & { watched: Record<string, unknown>[] }
    expect(written.watched[0]).toMatchObject({ id: 3, mediaType: 'tv', watched_at: '2024-01-05', episodes: 62, lastEpisode: 'S5E16' })
    expect(written.watched[1]).toMatchObject({ id: 4, mediaType: 'movie' })
    expect(written.watched[1].watched_at).toBeUndefined()
  })

  it('defaults a missing watched array to empty for old clients', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody() }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as { watched: unknown[] }
    expect(written.watched).toEqual([])
  })

  it.each([
    { id: 'x', title: 'Bad id' },
    { id: 1, title: 'T', mediaType: 'podcast' },
    { id: 1, title: 'x'.repeat(301) },
    'not an object'
  ])('rejects malformed watched entry %j', async (bad) => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody({ watched: [{ watched_at: '2024-01-01', ...(typeof bad === 'object' ? bad : {}) }] }) }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('rejects a watched array over the free limit', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody({
      watched: Array.from({ length: 501 }, (_, i) => ({ id: i + 1, mediaType: 'movie', title: 'T' }))
    }) }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('rejects a wrong sync key', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: validBody({ key: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }) }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('stores a valid Discord webhook without touching prefs', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: {
      email: EMAIL,
      key: SYNC_KEY,
      discordWebhook: 'https://discord.com/api/webhooks/123/abc'
    } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).toHaveBeenCalledWith(DISCORD_KEY, { [EMAIL]: 'https://discord.com/api/webhooks/123/abc' })
    expect(mocks.kvHset).not.toHaveBeenCalledWith(ALERTS_PREFS_KEY, expect.anything())
  })

  it('clears the webhook on an empty string', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { email: EMAIL, key: SYNC_KEY, discordWebhook: '' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHdel).toHaveBeenCalledWith(DISCORD_KEY, EMAIL)
  })

  it.each([
    'https://evil.com/api/webhooks/123/abc',
    'http://discord.com/api/webhooks/123/abc',
    'https://discord.com.evil.com/api/webhooks/123/abc',
    'https://discord.com/users/@me',
    'not a url'
  ])('rejects non-Discord webhook %s', async (url) => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { email: EMAIL, key: SYNC_KEY, discordWebhook: url } }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalledWith(DISCORD_KEY, expect.anything())
  })
})

describe('GET /api/alerts-prefs', () => {
  const getReq = (key = SYNC_KEY) => makeReq({ method: 'GET', query: { email: EMAIL, key } })

  it('returns the stored prefs for valid credentials', async () => {
    const prefs = { watchlist: [{ id: 1, mediaType: 'movie', title: 'F' }], services: ['netflix'], region: 'US', updatedAt: 1 }
    mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : key === ALERTS_PREFS_KEY ? prefs : null)
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ prefs, discordWebhook: null })
  })

  it('returns null prefs when nothing is stored yet', async () => {
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ prefs: null, discordWebhook: null })
  })

  it('rejects a wrong key without reading prefs', async () => {
    const res = makeRes()
    await handler(getReq('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'), res)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a malformed email', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { email: 'not-an-email', key: SYNC_KEY } }), res)
    expect(res.statusCode).toBe(400)
  })
})
