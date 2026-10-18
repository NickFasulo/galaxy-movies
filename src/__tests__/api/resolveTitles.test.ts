import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/resolve-titles'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn<(title: string, year?: string) => Promise<unknown>>(async () => null),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../utils/ai/movieSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/ai/movieSearch')>()),
  resolveTitleItem: mocks.resolve
}))
vi.mock('../../utils/core/redis', () => ({ getRedis: () => ({ eval: mocks.kvEval }) }))

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
}

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function makeReq(body?: unknown): NextApiRequest {
  const ip = nextIp()
  return {
    method: 'POST',
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    body,
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
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
  mocks.resolve.mockResolvedValue(null)
})

describe('POST /api/resolve-titles', () => {
  it('rejects non-array, oversized, and malformed item payloads', async () => {
    for (const body of [
      {},
      { items: 'x' },
      { items: Array.from({ length: 51 }, () => ({ title: 'T' })) },
      { items: [{ title: '' }] },
      { items: [{ title: '   ' }] },
      { items: [{ title: 'x'.repeat(101) }] },
      { items: [{ title: 5 }] },
      { items: [null] }
    ]) {
      const res = makeRes()
      await handler(makeReq(body), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  it('resolves each item in order, nulling misses', async () => {
    mocks.resolve.mockImplementation(async (title) =>
      title === 'Heat' ? { id: 949, mediaType: 'movie', title: 'Heat', year: '1995', poster_path: '/p.jpg' } : null
    )
    const res = makeRes()
    await handler(makeReq({ items: [{ title: 'Heat', year: '1995' }, { title: 'Nonexistent' }, { title: 'Heat' }] }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: { title: string; resolved: unknown }[] }
    expect(results).toHaveLength(3)
    expect(results[0]!.resolved).toMatchObject({ id: 949 })
    expect(results[1]!.resolved).toBeNull()
    expect(results[2]!.resolved).toMatchObject({ id: 949 })
  })

  it('passes the year through only when it is a four-digit string', async () => {
    const res = makeRes()
    await handler(makeReq({ items: [{ title: 'Heat', year: '1995' }, { title: 'Heat', year: '95' }, { title: 'Heat', year: 1995 }] }), res)
    expect(mocks.resolve).toHaveBeenNthCalledWith(1, 'Heat', '1995')
    expect(mocks.resolve).toHaveBeenNthCalledWith(2, 'Heat', undefined)
    expect(mocks.resolve).toHaveBeenNthCalledWith(3, 'Heat', undefined)
  })

  it('accepts an empty items array', async () => {
    const res = makeRes()
    await handler(makeReq({ items: [] }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ results: [] })
  })
})
