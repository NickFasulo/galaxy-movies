import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hset: vi.fn(async () => 1),
  hgetall: vi.fn(async () => null as Record<string, unknown> | null)
}))
vi.mock('./redis', () => ({ getRedis: () => ({ hset: mocks.hset, hgetall: mocks.hgetall }) }))

import { noindexPaths, recordIndexability } from './indexability'

afterEach(() => {
  mocks.hset.mockClear()
  mocks.hgetall.mockClear()
})

describe('recordIndexability', () => {
  it('writes the verdict to the shared hash by path', async () => {
    await recordIndexability('/in/streaming/hoichoi/comedy', false)
    expect(mocks.hset).toHaveBeenCalledWith('gm:indexability:noindex', { '/in/streaming/hoichoi/comedy': 0 })

    await recordIndexability('/streaming/netflix', true)
    expect(mocks.hset).toHaveBeenLastCalledWith('gm:indexability:noindex', { '/streaming/netflix': 1 })
  })

  it('never throws when Redis is unavailable', async () => {
    mocks.hset.mockRejectedValueOnce(new Error('down'))
    await expect(recordIndexability('/x', false)).resolves.toBeUndefined()
  })
})

describe('noindexPaths', () => {
  it('returns only the paths whose last render was thin', async () => {
    mocks.hgetall.mockResolvedValue({ '/a': 1, '/b': 0, '/c': '0' })
    const set = await noindexPaths()
    expect(set).toEqual(new Set(['/b', '/c']))
  })

  it('fails open to an empty set so the sitemap keeps every URL', async () => {
    mocks.hgetall.mockRejectedValue(new Error('down'))
    await expect(noindexPaths()).resolves.toEqual(new Set())
  })
})
