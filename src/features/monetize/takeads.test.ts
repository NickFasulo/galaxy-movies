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
