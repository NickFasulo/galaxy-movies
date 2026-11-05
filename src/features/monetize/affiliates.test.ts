import { afterEach, describe, expect, it, vi } from 'vitest'
import { AMAZON_ASSOCIATE_TAG, buildAmazonAffiliateLink, tagAmazonUrl } from './affiliates'

describe('tagAmazonUrl', () => {
  it('appends the Associates tag to amazon.com product links', () => {
    const tagged = tagAmazonUrl('https://www.amazon.com/dp/B0EXAMPLE')
    expect(tagged).toContain(`tag=${AMAZON_ASSOCIATE_TAG}`)
  })

  it('replaces an existing tag param', () => {
    const tagged = tagAmazonUrl('https://www.amazon.com/dp/B0EXAMPLE?tag=someone-else-20')
    expect(tagged).toContain(`tag=${AMAZON_ASSOCIATE_TAG}`)
    expect(tagged).not.toContain('someone-else-20')
  })

  it('preserves other query params', () => {
    const tagged = tagAmazonUrl('https://www.amazon.com/gp/product/B0EXAMPLE?ref_=atv')
    expect(tagged).toContain('ref_=atv')
    expect(tagged).toContain(`tag=${AMAZON_ASSOCIATE_TAG}`)
  })

  it.each([
    'https://tv.apple.com/us/movie/x',
    'https://www.vudu.com/content/movies/details/x',
    'https://www.amazon.co.uk/dp/B0EXAMPLE'
  ])('passes non-amazon.com URLs through: %s', (url) => {
    expect(tagAmazonUrl(url)).toBe(url)
  })

  it.each([null, undefined, '', 'not a url'])('handles bad input %j', (input) => {
    expect(tagAmazonUrl(input)).toBe(input || null)
  })

  it('tags amazon.in links with the IN Associates tag when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_AMAZON_IN_TAG', 'galaxymovie-21')
    expect(tagAmazonUrl('https://www.amazon.in/dp/B0EXAMPLE')).toContain('tag=galaxymovie-21')
    vi.unstubAllEnvs()
    expect(tagAmazonUrl('https://www.amazon.in/dp/B0EXAMPLE')).toBe('https://www.amazon.in/dp/B0EXAMPLE')
  })
})

describe('buildAmazonAffiliateLink', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('builds an amazon.com search link with the US tag', () => {
    const url = buildAmazonAffiliateLink('Fight Club')
    expect(url).toMatch(/^https:\/\/www\.amazon\.com\/s\?/)
    expect(url).toContain(`tag=${AMAZON_ASSOCIATE_TAG}`)
    expect(url).toContain('k=Fight+Club+%28movie%29')
  })

  it('returns null for IN until an IN Associates tag is configured', () => {
    expect(buildAmazonAffiliateLink('Fight Club', 'IN')).toBeNull()
  })

  it('builds an amazon.in search link once the IN tag is set', () => {
    vi.stubEnv('NEXT_PUBLIC_AMAZON_IN_TAG', 'galaxymovie-21')
    const url = buildAmazonAffiliateLink('Fight Club', 'IN')
    expect(url).toMatch(/^https:\/\/www\.amazon\.in\/s\?/)
    expect(url).toContain('tag=galaxymovie-21')
  })
})
