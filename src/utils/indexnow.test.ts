import { afterEach, describe, expect, it, vi } from 'vitest'
import { pingIndexNow } from './indexnow'

afterEach(() => vi.unstubAllGlobals())

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
})
