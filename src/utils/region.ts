import type { IncomingHttpHeaders } from 'http'

export const DEFAULT_REGION = 'US'

export function detectRegion(req?: { headers?: IncomingHttpHeaders } | null): string {
  const headers: IncomingHttpHeaders = req?.headers || {}
  const country = headers['x-vercel-ip-country'] || headers['cf-ipcountry']
  return (Array.isArray(country) ? country[0] : country) || DEFAULT_REGION
}
