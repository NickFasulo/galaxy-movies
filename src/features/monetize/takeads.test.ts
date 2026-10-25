import { describe, expect, it } from 'vitest'
import { getProviderHomePage } from './takeads'

describe('getProviderHomePage', () => {
  it.each([
    ['Netflix', 'https://www.netflix.com'],
    ['HBO Max', 'https://www.max.com'],
    ['Apple TV+', 'https://tv.apple.com'],
    ['Disney Plus', 'https://www.disneyplus.com'],
    ['Paramount Plus', 'https://www.paramountplus.com'],
    ['ESPN Plus', 'https://plus.espn.com'],
    ['Curiosity Stream', 'https://curiositystream.com'],
    ['iQIYI', 'https://www.iq.com'],
    ['Crave Starz', 'https://www.crave.ca'],
    ['Canal+', 'https://www.canalplus.com'],
    ['waipu.tv', 'https://www.waipu.tv'],
    ['Zattoo', 'https://zattoo.com'],
    ['DAZN', 'https://www.dazn.com']
  ])('maps %s to its homepage', (provider, url) => {
    expect(getProviderHomePage(provider)).toBe(url)
  })

  it('returns null for Amazon providers (they keep Associates links)', () => {
    expect(getProviderHomePage('Amazon Prime Video')).toBeNull()
  })

  it.each([
    // "max" is a substring of ManoramaMAX — a bare includes() sent it to HBO.
    ['ManoramaMAX', 'https://www.manoramamax.com'],
    // MENA Starzplay is a different service from the US Starz network.
    ['Starzplay', 'https://www.starzplay.com'],
    ['Starzplay Arabia', 'https://www.starzplay.com'],
    ['Lionsgate Play', 'https://lionsgateplay.com']
  ])('maps %s without substring collisions', (provider, url) => {
    expect(getProviderHomePage(provider)).toBe(url)
  })

  it.each(['Niche Streamer', '', undefined])('returns null for unmapped provider %j', (provider) => {
    expect(getProviderHomePage(provider)).toBeNull()
  })
})

import { vi, beforeEach, afterEach } from 'vitest'

const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>>(
  async () => ({
    ok: true,
    json: async () => ({ data: [{ iri: 'https://www.netflix.com', trackingLink: 'https://tkts.uk/netflix' }] })
  }))

describe('resolveTakeadsLinks', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy); vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns nulls without an API key and never calls the resolver', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', '')
    const { resolveTakeadsLinks } = await import('./takeads')
    await expect(resolveTakeadsLinks(['https://a.com', 'https://b.com'])).resolves.toEqual({
      'https://a.com': null, 'https://b.com': null
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves tracking links and dedupes repeated iris into one request', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', 'k')
    const { resolveTakeadsLinks } = await import('./takeads')
    const result = await resolveTakeadsLinks(['https://www.netflix.com', 'https://www.netflix.com', 'https://www.hulu.com'])
    expect(result['https://www.netflix.com']).toBe('https://tkts.uk/netflix')
    expect(result['https://www.hulu.com']).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.takeads.com/v1/product/monetize-api/v2/resolve')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body as string)).toEqual({ iris: ['https://www.netflix.com', 'https://www.hulu.com'] })
  })

  it('serves repeat lookups from the cache without refetching', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', 'k')
    const { resolveTakeadsLinks } = await import('./takeads')
    await resolveTakeadsLinks(['https://www.netflix.com'])
    await resolveTakeadsLinks(['https://www.netflix.com'])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to nulls on a failed response and on a thrown fetch', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', 'k')
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const mod = await import('./takeads')
    await expect(mod.resolveTakeadsLinks(['https://x.com'])).resolves.toEqual({ 'https://x.com': null })
    // A failed fetch doesn't populate the cache — the next call retries upstream.
    fetchSpy.mockRejectedValueOnce(new Error('down'))
    await expect(mod.resolveTakeadsLinks(['https://x.com'])).resolves.toEqual({ 'https://x.com': null })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('getProviderAffiliateLinks', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy); vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns the tracking link when resolved and the homepage otherwise', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', 'k')
    const { getProviderAffiliateLinks } = await import('./takeads')
    const links = await getProviderAffiliateLinks(['Netflix', 'Hulu'])
    expect(links['Netflix']).toBe('https://tkts.uk/netflix')
    expect(links['Hulu']).toBe('https://www.hulu.com')
  })

  it('returns the homepage URL when the resolver is not configured', async () => {
    vi.stubEnv('TAKEADS_PUBLIC_KEY', '')
    const { getProviderAffiliateLinks } = await import('./takeads')
    const links = await getProviderAffiliateLinks(['Netflix', 'ManoramaMAX'])
    expect(links['Netflix']).toBe('https://www.netflix.com')
    expect(links['ManoramaMAX']).toBe('https://www.manoramamax.com')
  })
})
