import { describe, expect, it, vi, beforeEach } from 'vitest'
import handler from '../../pages/api/resolve-titles'
import { makeReq, makeRes } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn<(title: string, year?: string) => Promise<unknown>>(async () => null),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../features/ai/movieSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/ai/movieSearch')>()),
  resolveTitleItem: mocks.resolve
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => ({ eval: mocks.kvEval }) }))

const post = (body?: unknown) => makeReq({ method: 'POST', body })

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
      await handler(post(body), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  it('resolves each item in order, nulling misses', async () => {
    mocks.resolve.mockImplementation(async (title) =>
      title === 'Heat' ? { id: 949, mediaType: 'movie', title: 'Heat', year: '1995', poster_path: '/p.jpg' } : null
    )
    const res = makeRes()
    await handler(post({ items: [{ title: 'Heat', year: '1995' }, { title: 'Nonexistent' }, { title: 'Heat' }] }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: { title: string; resolved: unknown }[] }
    expect(results).toHaveLength(3)
    expect(results[0]!.resolved).toMatchObject({ id: 949 })
    expect(results[1]!.resolved).toBeNull()
    expect(results[2]!.resolved).toMatchObject({ id: 949 })
  })

  it('passes the year through only when it is a four-digit string', async () => {
    const res = makeRes()
    await handler(post({ items: [{ title: 'Heat', year: '1995' }, { title: 'Heat', year: '95' }, { title: 'Heat', year: 1995 }] }), res)
    expect(mocks.resolve).toHaveBeenNthCalledWith(1, 'Heat', '1995')
    expect(mocks.resolve).toHaveBeenNthCalledWith(2, 'Heat', undefined)
    expect(mocks.resolve).toHaveBeenNthCalledWith(3, 'Heat', undefined)
  })

  it('accepts an empty items array', async () => {
    const res = makeRes()
    await handler(post({ items: [] }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ results: [] })
  })
})
