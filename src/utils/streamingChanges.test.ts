import { describe, expect, it } from 'vitest'
import { PROVIDER_NAME_MATCH } from './tmdb'

const keyFor = (sourceName: string) =>
  Object.entries(PROVIDER_NAME_MATCH).find(([, pattern]) => pattern.test(sourceName))?.[0]

describe('PROVIDER_NAME_MATCH', () => {
  it.each([
    ['Netflix', 'netflix'],
    ['Netflix Basic with Ads', 'netflix'],
    ['Amazon Prime Video', 'amazon-prime-video'],
    ['Prime Video', 'amazon-prime-video'],
    ['Hulu', 'hulu'],
    ['Disney+', 'disney-plus'],
    ['Disney Plus', 'disney-plus'],
    ['Apple TV+', 'apple-tv'],
    ['Max', 'max'],
    ['HBO Max', 'max'],
    ['Peacock Premium', 'peacock'],
    ['Paramount+', 'paramount-plus'],
    ['Paramount Plus', 'paramount-plus']
  ])('maps Watchmode source "%s" to "%s"', (sourceName, key) => {
    expect(keyFor(sourceName)).toBe(key)
  })

  it.each(['Amazon Freevee', 'HBO', 'Apple Store', 'YouTube'])(
    'does not match "%s" to a tracked provider',
    (sourceName) => expect(keyFor(sourceName)).toBeUndefined()
  )
})
