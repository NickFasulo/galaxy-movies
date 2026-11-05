export const AMAZON_ASSOCIATE_TAG = 'galaxymovie03-20'

// Amazon Associates India is a separate program/enrollment — until a tag is
// configured, IN visitors get the Takeads-resolved primevideo.com link instead
// (ProviderCell treats a null return here as "use affiliateLink").
const amazonInTag = () => process.env.NEXT_PUBLIC_AMAZON_IN_TAG || ''

export function isAmazonProvider(providerName = '') {
  return providerName.toLowerCase().includes('amazon')
}

export function buildAmazonAffiliateLink(movieTitle = '', region = 'US'): string | null {
  const inTag = region === 'IN' ? amazonInTag() : null
  if (region === 'IN' && !inTag) return null
  const params = new URLSearchParams({
    k: `${movieTitle} (movie)`.trim(),
    i: 'instant-video',
    tag: inTag || AMAZON_ASSOCIATE_TAG
  })
  return `https://www.amazon.${region === 'IN' ? 'in' : 'com'}/s?${params.toString()}`
}

// Watchmode web_urls are raw store deep links — unpaid unless the Associates
// tag is appended. Non-Amazon URLs pass through untouched.
export function tagAmazonUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const tag = /(^|\.)amazon\.com$/i.test(parsed.hostname)
      ? AMAZON_ASSOCIATE_TAG
      : /(^|\.)amazon\.in$/i.test(parsed.hostname)
        ? amazonInTag()
        : ''
    if (!tag) return url
    parsed.searchParams.set('tag', tag)
    return parsed.toString()
  } catch {
    return url
  }
}

// CJ tracking links for Gruv (program 5830404) — physical media: DVD, Blu-ray,
// 4K. The 1x1 images are CJ's impression pixels — they power CTR reporting,
// keep them next to each link.
const GRUV_AFFILIATE_LINK = 'https://www.anrdoezrs.net/click-101891488-15735954'
export const GRUV_AFFILIATE_PIXEL = 'https://www.ftjcfx.com/image-101891488-15735954'

export const GRUV_LINK_TEXT = 'Buy the disc at Gruv'

// This CJ program honors a ?url= deep-link destination: the click redirects to
// the encoded URL with tracking params appended. Pass resolved product URLs
// (see monetize/gruv) — search-page links land on wrong or zero results.
export function buildGruvLink(destination?: string | null) {
  if (!destination) return GRUV_AFFILIATE_LINK
  return `${GRUV_AFFILIATE_LINK}?url=${encodeURIComponent(destination)}`
}

// CJ tracking links for NordVPN (program 4837117). The 1x1 images are CJ's
// impression pixels — they power CTR reporting, keep them next to each link.
export const VPN_AFFILIATE_LINK = 'https://www.jdoqocy.com/click-101891488-12814518'
export const VPN_AFFILIATE_PIXEL = 'https://www.ftjcfx.com/image-101891488-12814518'

export const VPN_DEAL_LINK = 'https://www.jdoqocy.com/click-101891488-12956939'
export const VPN_DEAL_PIXEL = 'https://www.lduhtrp.net/image-101891488-12956939'

export const VPN_LINK_TEXT = 'Hide your IP with NordVPN'
export const VPN_CTA_TEXT = 'Get the NordVPN deal'
