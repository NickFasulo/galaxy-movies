// Shared visitor-region detection for server-rendered pages.
// Vercel's edge network sets `x-vercel-ip-country` for every request; Cloudflare
// (used by some CDNs) sets `cf-ipcountry`. Both are ISO 3166-1 alpha-2 codes.
export const DEFAULT_REGION = 'US'

export function detectRegion(req) {
  const headers = req?.headers || {}
  const country = headers['x-vercel-ip-country'] || headers['cf-ipcountry']
  return country || DEFAULT_REGION
}
