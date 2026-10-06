import type { NextApiRequest, NextApiResponse } from 'next'
import { isBot } from './rateLimiter'

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
