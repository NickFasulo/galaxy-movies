// CJ tracking links for Gruv (program 5830404) — physical media: DVD, Blu-ray,
// 4K. The 1x1 images are CJ's impression pixels — they power CTR reporting,
// keep them next to each link.
export const GRUV_AFFILIATE_LINK = 'https://www.anrdoezrs.net/click-101891488-15735954'
export const GRUV_AFFILIATE_PIXEL = 'https://www.ftjcfx.com/image-101891488-15735954'

export const GRUV_DEAL_LINK = 'https://www.kqzyfj.com/click-101891488-15032169'
export const GRUV_DEAL_PIXEL = 'https://www.lduhtrp.net/image-101891488-15032169'

export const GRUV_LINK_TEXT = 'Buy the disc at Gruv'

// This CJ program honors a ?url= deep-link destination: the click redirects to
// the encoded URL with tracking params appended. Gruv is Shopify, so /search
// takes a plain q= query.
export function buildGruvLink(title = '') {
  if (!title.trim()) return GRUV_AFFILIATE_LINK
  const destination = `https://gruv.com/search?q=${encodeURIComponent(title.trim())}`
  return `${GRUV_AFFILIATE_LINK}?url=${encodeURIComponent(destination)}`
}
