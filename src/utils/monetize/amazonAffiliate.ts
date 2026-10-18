export const AMAZON_ASSOCIATE_TAG = 'galaxymovie03-20'

export function isAmazonProvider(providerName = '') {
  return providerName.toLowerCase().includes('amazon')
}

export function buildAmazonAffiliateLink(movieTitle = '') {
  const query = `${movieTitle} (movie)`.trim()
  const params = new URLSearchParams({
    k: query,
    i: 'instant-video',
    tag: AMAZON_ASSOCIATE_TAG
  })
  return `https://www.amazon.com/s?${params.toString()}`
}
