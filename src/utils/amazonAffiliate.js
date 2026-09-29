export const AMAZON_ASSOCIATE_TAG = 'galaxymovie03-20'

// No Amazon.in Associates account has been set up yet (that program is separate from the
// US Associates program). NEXT_PUBLIC_AMAZON_IN_ASSOCIATE_TAG can be set once one exists;
// until then we still send India visitors to the amazon.in marketplace (correct currency,
// availability, and shipping) rather than amazon.com, just without commission attribution.
export const AMAZON_IN_ASSOCIATE_TAG = process.env.NEXT_PUBLIC_AMAZON_IN_ASSOCIATE_TAG || null

const AMAZON_DOMAINS_BY_REGION = {
  IN: 'https://www.amazon.in'
}
const DEFAULT_AMAZON_DOMAIN = 'https://www.amazon.com'

export function isAmazonProvider(providerName = '') {
  return providerName.toLowerCase().includes('amazon')
}

export function buildAmazonAffiliateLink(movieTitle = '', region = 'US') {
  const query = `${movieTitle} (movie)`.trim()
  const domain = AMAZON_DOMAINS_BY_REGION[region] || DEFAULT_AMAZON_DOMAIN
  const tag = (region === 'IN' && AMAZON_IN_ASSOCIATE_TAG) || AMAZON_ASSOCIATE_TAG
  const params = new URLSearchParams({
    k: query,
    i: 'instant-video',
    tag
  })
  return `${domain}/s?${params.toString()}`
}
