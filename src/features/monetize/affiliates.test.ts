import { describe, expect, it } from 'vitest'
import { AMAZON_ASSOCIATE_TAG, tagAmazonUrl } from './affiliates'

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
})
