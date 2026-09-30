export const DEFAULT_REGION = 'US'

export function detectRegion(req) {
  const headers = req?.headers || {}
  const country = headers['x-vercel-ip-country'] || headers['cf-ipcountry']
  return country || DEFAULT_REGION
}
