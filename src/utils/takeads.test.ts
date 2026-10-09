import { describe, expect, it } from 'vitest'
import { getProviderHomePage } from './takeads'

describe('getProviderHomePage', () => {
  it.each([
    ['Netflix', 'https://www.netflix.com'],
    ['HBO Max', 'https://www.max.com'],
    ['Apple TV+', 'https://tv.apple.com'],
    ['Disney Plus', 'https://www.disneyplus.com'],
    ['Paramount Plus', 'https://www.paramountplus.com']
  ])('maps %s to its homepage', (provider, url) => {
    expect(getProviderHomePage(provider)).toBe(url)
  })

  it('returns null for Amazon providers (they keep Associates links)', () => {
    expect(getProviderHomePage('Amazon Prime Video')).toBeNull()
  })

  it.each(['Niche Streamer', '', undefined])('returns null for unmapped provider %j', (provider) => {
    expect(getProviderHomePage(provider)).toBeNull()
  })
})
