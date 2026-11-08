import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ redisSet: vi.fn(async () => 'OK') }))
vi.mock('./redis', () => ({ getRedis: () => ({ set: mocks.redisSet }) }))

import { pingIndexNow } from './indexnow'

afterEach(() => {
  vi.unstubAllGlobals()
  mocks.redisSet.mockClear()
})

describe('pingIndexNow', () => {
  it('posts deduped urls with the matching key location', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await pingIndexNow([
      'https://www.galaxymovies.app/movies/1',
      'https://www.galaxymovies.app/movies/1',
      'https://www.galaxymovies.app/tv/2'
    ])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.host).toBe('www.galaxymovies.app')
    expect(body.urlList).toEqual(['https://www.galaxymovies.app/movies/1', 'https://www.galaxymovies.app/tv/2'])
    expect(body.keyLocation).toBe(`https://www.galaxymovies.app/${body.key}.txt`)
  })

  it('skips the request entirely when the list is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await pingIndexNow([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws on non-OK responses or network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await expect(pingIndexNow(['https://www.galaxymovies.app/movies/1'])).resolves.toBeUndefined()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(pingIndexNow(['https://www.galaxymovies.app/movies/1'])).resolves.toBeUndefined()
  })

  it('sweeps every endpoint twice before recording failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    await pingIndexNow(['https://www.galaxymovies.app/movies/1'], ['https://a.example/in', 'https://b.example/in'])

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      'https://a.example/in', 'https://b.example/in', 'https://a.example/in', 'https://b.example/in'
    ])
    expect(mocks.redisSet).toHaveBeenLastCalledWith('gm:indexnow:last', expect.objectContaining({ ok: false, status: 429 }))
  })

  it('succeeds on a later pass when the first sweep is rate-limited', async () => {
    const fetchMock = vi.fn().mockImplementation((u: string) =>
      Promise.resolve(new Response('', { status: u.includes('bing.com') ? 200 : 429 }))
    )
    vi.stubGlobal('fetch', fetchMock)

    await pingIndexNow(['https://www.galaxymovies.app/movies/1'], ['https://a.example/in', 'https://www.bing.com/indexnow'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.redisSet).toHaveBeenLastCalledWith('gm:indexnow:last', expect.objectContaining({ ok: true, via: 'www.bing.com' }))
  })

  it('falls back to the bing endpoint when the relay is rate-limited', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await pingIndexNow(['https://www.galaxymovies.app/movies/1'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://www.bing.com/indexnow')
    expect(mocks.redisSet).toHaveBeenLastCalledWith('gm:indexnow:last', expect.objectContaining({ ok: true, status: 200, via: 'www.bing.com' }))
  })

  it('records the last ping outcome for the weekly report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await pingIndexNow(['https://www.galaxymovies.app/movies/1'])
    expect(mocks.redisSet).toHaveBeenCalledWith('gm:indexnow:last', expect.objectContaining({ ok: true, urls: 1, status: 200 }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await pingIndexNow(['https://www.galaxymovies.app/movies/2'])
    expect(mocks.redisSet).toHaveBeenLastCalledWith('gm:indexnow:last', expect.objectContaining({ ok: false, status: 429 }))
  })
})
