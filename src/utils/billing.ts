import { LRUCache } from 'lru-cache'
import type { NextApiRequest } from 'next'
import { getRedis, SYNCKEY_KEY, BILLING_KEY } from './waitlistStore'
import { safeEqual } from './auth'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/
const KEY_PATTERN = /^[0-9a-f-]{36}$/i

export interface BillingRecord {
  status: string
  subscriptionId?: string
  customerId?: string
  currentPeriodEnd?: number
  updatedAt?: number
}

// Webhook writes are rare and reads happen on chat/alert hot paths — a short
// LRU keeps entitlement checks off the Upstash bill for repeat callers. The
// wrapper object is because lru-cache can't store a null hit.
const billingCache = new LRUCache<string, { record: BillingRecord | null }>({ max: 1000, ttl: 60_000 })

export function isPlusActive(record: BillingRecord | null | undefined, now = Date.now()): boolean {
  if (!record) return false
  if (record.status === 'active' || record.status === 'trialing') return true
  // Canceled-but-paid-through stays entitled until the period ends.
  return record.status === 'canceled' && typeof record.currentPeriodEnd === 'number' && record.currentPeriodEnd > now
}

export function parseBillingRecord(raw: unknown): BillingRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  return typeof obj.status === 'string' ? (obj as unknown as BillingRecord) : null
}

export async function getBillingRecord(email: string): Promise<BillingRecord | null> {
  if (billingCache.has(email)) return billingCache.get(email)?.record ?? null
  const kv = getRedis()
  if (!kv) return null
  try {
    const record = parseBillingRecord(await kv.hget(BILLING_KEY, email))
    billingCache.set(email, { record })
    return record
  } catch (err) {
    console.error('Billing record read error:', err)
    return null
  }
}

// The email+synckey pair minted on alerts confirmation doubles as the login
// for every paid endpoint — there is deliberately no account system.
export async function getLinkedEmail(req: NextApiRequest): Promise<string | null> {
  const source = req.method === 'GET' ? req.query : req.body || {}
  const email = String(source.email || '').trim().toLowerCase()
  const key = String(source.key || '')
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !KEY_PATTERN.test(key)) return null
  const kv = getRedis()
  if (!kv) return null
  try {
    const stored = await kv.hget<string>(SYNCKEY_KEY, email)
    return stored && safeEqual(stored, key) ? email : null
  } catch {
    return null
  }
}

export async function isPlusSubscriber(email: string, key: string): Promise<boolean> {
  const kv = getRedis()
  if (!kv) return false
  try {
    const stored = await kv.hget<string>(SYNCKEY_KEY, email)
    if (!stored || !safeEqual(stored, key)) return false
  } catch {
    return false
  }
  return isPlusActive(await getBillingRecord(email))
}
