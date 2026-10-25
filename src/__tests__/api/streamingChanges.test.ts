import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  getProviderChanges: vi.fn<(keys?: string[]) => Promise<Record<string, unknown>>>(async () => ({}))
}))

vi.mock('../../features/catalog/streamingChanges', () => ({
  getProviderChanges: mocks.getProviderChanges
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/streaming-changes'

const change = {
  source: 'Netflix',
  updatedAt: '2025-01-10T00:00:00.000Z',
  coming: [{ tmdbId: 1, tmdbType: 'movie', title: 'Coming', date: '2025-02-01' }],
  added: [{ tmdbId: 2, tmdbType: 'movie', title: 'Added' }],
  left: [{ tmdbId: 3, tmdbType: 'tv', title: 'Left' }]
}

beforeEach(() => {
  resetFakeRedis()
  mocks.getProviderChanges.mockResolvedValue({ netflix: change })
})

describe('GET /api/streaming-changes', () => {
  it('sets CORS headers and short-circuits OPTIONS with 204', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'OPTIONS' }), res)
    expect(res.statusCode).toBe(204)
    expect(res.ended).toBe(true)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(mocks.getProviderChanges).not.toHaveBeenCalled()
  })

  it('405s non-GET methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { provider: 'netflix' } }), res)
    expect(res.statusCode).toBe(405)
  })

  it('does not reject bot UAs — the feed is deliberately public', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'netflix' }, ua: 'curl/8.0' }), res)
    expect(res.statusCode).toBe(200)
  })

  it('400s without a provider and lists the embeddable keys', async () => {
    const res = makeRes()
    await handler(makeReq({ query: {} }), res)
    expect(res.statusCode).toBe(400)
    const body = res.jsonBody as { error: string; providers: string[] }
    expect(body.error).toBe('provider query param is required')
    expect(body.providers).toContain('netflix')
    expect(mocks.getProviderChanges).not.toHaveBeenCalled()
  })

  it('404s on a non-embeddable provider', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'jiohotstar' } }), res)
    expect(res.statusCode).toBe(404)
    expect((res.jsonBody as { error: string }).error).toBe("Unknown provider 'jiohotstar'")
  })

  it('serializes a single provider with label and attribution', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'Netflix' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.getProviderChanges).toHaveBeenCalledWith(['netflix'])
    const body = res.jsonBody as Record<string, unknown>
    expect(body).toMatchObject({
      provider: 'netflix',
      label: 'Netflix',
      source: 'Netflix',
      updatedAt: '2025-01-10T00:00:00.000Z',
      coming: change.coming,
      added: change.added,
      left: change.left,
      attribution: { text: 'Powered by Galaxy Movies' }
    })
    expect((body.attribution as { url: string }).url).toContain('/leaving/netflix')
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
  })

  it('503s when the provider has no change data', async () => {
    mocks.getProviderChanges.mockResolvedValue({})
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'netflix' } }), res)
    expect(res.statusCode).toBe(503)
  })

  it('provider=all returns only providers with data', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'all' } }), res)
    expect(res.statusCode).toBe(200)
    const body = res.jsonBody as { providers: Record<string, { provider: string; label: string }> }
    expect(Object.keys(body.providers)).toEqual(['netflix'])
    expect(body.providers.netflix.provider).toBe('netflix')
    expect(body.providers.netflix.label).toBe('Netflix')
    expect(mocks.getProviderChanges).toHaveBeenCalledTimes(1)
    expect(mocks.getProviderChanges.mock.calls[0][0]).toContain('netflix')
  })

  it('per-IP rate limit trips at 120 with a Retry-After header', async () => {
    fakeRedis.map.set('changes_rl:10.0.0.11', 120)
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'netflix' }, ip: '10.0.0.11' }), res)
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('3600')
    expect(mocks.getProviderChanges).not.toHaveBeenCalled()
  })
})
