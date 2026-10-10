import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/poster-paths'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string) => Promise<unknown>>(async () => ({})),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../utils/tmdb', () => ({ fetchTmdb: mocks.fetchTmdb }))
vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ eval: mocks.kvEval })
}))

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function makeReq({ method = 'POST', body }: { method?: string; body?: unknown } = {}): NextApiRequest {
  const ip = nextIp()
  return {
    method,
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    body,
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
}

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
}

function makeRes(): MockRes {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    setHeader() {},
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload
      return res
    },
    end() { return res }
  }
  return res as unknown as MockRes
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/poster-paths', () => {
  it('resolves poster paths for movie and tv items', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/1') return { poster_path: '/film.jpg', title: 'Film', release_date: '2001-05-01' }
      if (path === '/tv/2') return { poster_path: '/show.jpg', name: 'Show', first_air_date: '2019-01-01' }
      throw new Error(`unexpected ${path}`)
    })
    const res = makeRes()
    await handler(makeReq({ body: { items: [{ id: 1 }, { id: 2, mediaType: 'tv' }] } }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: Record<string, unknown>[] }
    expect(results).toEqual([
      { id: 1, mediaType: 'movie', poster_path: '/film.jpg', title: 'Film', year: '2001' },
      { id: 2, mediaType: 'tv', poster_path: '/show.jpg', title: 'Show', year: '2019' }
    ])
  })

  it('drops items whose TMDB lookup fails instead of failing the batch', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/1') return { poster_path: '/film.jpg', title: 'Film', release_date: '2001-01-01' }
      throw new Error('tmdb down')
    })
    const res = makeRes()
    await handler(makeReq({ body: { items: [{ id: 1 }, { id: 2 }] } }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: Record<string, unknown>[] }
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe(1)
  })

  it('rejects a missing or empty items list without calling TMDB', async () => {
    for (const body of [undefined, {}, { items: 'x' }, { items: [] }, { items: [{ id: -1 }, { id: 'a' }] }]) {
      const res = makeRes()
      await handler(makeReq({ body }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })
})
