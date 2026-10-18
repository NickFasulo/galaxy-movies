import type { IncomingHttpHeaders } from 'http'

export const DEFAULT_REGION = 'US'

export const REGION_DISPLAY_NAMES: Record<string, string> = { US: 'the United States', IN: 'India' }

export function detectRegion(req?: { headers?: IncomingHttpHeaders } | null): string {
  const headers: IncomingHttpHeaders = req?.headers || {}
  const country = headers['x-vercel-ip-country'] || headers['cf-ipcountry']
  return (Array.isArray(country) ? country[0] : country) || DEFAULT_REGION
}

export function regionDisplayName(code: string): string {
  return REGION_DISPLAY_NAMES[code] || 'your region'
}

export function regionListDisplayNames(codes?: string[]): string {
  return (codes || []).map((c) => REGION_DISPLAY_NAMES[c] || c).join(' and ')
}
