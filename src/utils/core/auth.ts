import { timingSafeEqual } from 'crypto'
import type { IncomingMessage } from 'http'

export function safeEqual(a: unknown, b: unknown): boolean {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export function isCronAuthorized(req: Pick<IncomingMessage, 'headers'>): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return safeEqual(req.headers.authorization || '', `Bearer ${secret}`)
}
