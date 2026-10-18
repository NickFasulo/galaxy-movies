import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next'
import { isBot } from './rateLimiter'

type SsrResponse = GetServerSidePropsContext['res']

export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

export function setSwrCache(res: SsrResponse, sMaxage = 86400, staleWhileRevalidate = 604800) {
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxage}, stale-while-revalidate=${staleWhileRevalidate}`)
}

// ?page=N support: infinite-scroll pages SSR deep pages so crawlers can
// reach content past page 1 (Google's paginated-URL guidance).
export function getPageParam(query: GetServerSidePropsContext['query']) {
  const raw = Array.isArray(query.page) ? query.page[0] : query.page
  return { page: Math.max(1, Math.floor(Number(raw)) || 1), requested: raw !== undefined }
}

export function requireMethod(req: NextApiRequest, res: NextApiResponse, methods: string | string[]): boolean {
  const allowed = Array.isArray(methods) ? methods : [methods]
  if (req.method && allowed.includes(req.method)) return true
  res.setHeader('Allow', allowed)
  res.status(405).end(`Method ${req.method} Not Allowed`)
  return false
}

export function rejectBot(req: NextApiRequest, res: NextApiResponse): boolean {
  if (!isBot(req.headers['user-agent'])) return false
  res.status(403).json({ error: 'Bot access denied' })
  return true
}

export function setApiCache(res: NextApiResponse, sMaxage: number, staleWhileRevalidate: number, { cdn = false }: { cdn?: boolean } = {}) {
  const value = `public, s-maxage=${sMaxage}, stale-while-revalidate=${staleWhileRevalidate}`
  res.setHeader('Cache-Control', value)
  if (cdn) res.setHeader('Vercel-CDN-Cache-Control', value)
}
