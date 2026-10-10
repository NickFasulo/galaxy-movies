import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

const kv = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(async () => 'OK') }))
const getRedis = vi.hoisted(() => vi.fn((): unknown => null))

vi.mock('../../utils/redis', () => ({ getRedis }))

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>
let handler: Handler

function makeReq(method: string): NextApiRequest {
  return { method, headers: { 'user-agent': 'Mozilla/5.0' } } as NextApiRequest
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

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  getRedis.mockReturnValue(null)
  handler = (await import('../../pages/api/aiStatus')).default
})

describe('GET /api/aiStatus', () => {
  it('reports unavailable when there is no API key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const res = makeRes()
    await handler(makeReq('GET'), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ available: false })
  })

  it('reports available with a key and no Redis flag', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const res = makeRes()
    await handler(makeReq('GET'), res)
    expect(res.jsonBody).toEqual({ available: true })
  })

  it('reports unavailable when the Redis kill switch is set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    kv.get.mockResolvedValue(1)
    getRedis.mockReturnValue(kv)
    const res = makeRes()
    await handler(makeReq('GET'), res)
    expect(res.jsonBody).toEqual({ available: false })
  })

  it('sets CDN cache headers', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const res = makeRes()
    await handler(makeReq('GET'), res)
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=3600')
    expect(res.headers['Vercel-CDN-Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=3600')
  })

  it('rejects POST with 405', async () => {
    const res = makeRes()
    await handler(makeReq('POST'), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers['Allow']).toEqual(['GET'])
  })
})
