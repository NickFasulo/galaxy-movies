import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac } from 'crypto'
import { getRedis, BILLING_KEY } from '../../../utils/waitlistStore'
import { safeEqual } from '../../../utils/auth'

// Raw body is required for the webhook signature check.
export const config = {
  api: {
    bodyParser: false
  }
}

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function headerValue(req: NextApiRequest, name: string): string {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) || ''
}

// Polar sends Standard Webhooks headers (webhook-id/-timestamp/-signature over
// "{id}.{ts}.{body}"). The HMAC key is the literal secret string — including
// any whsec_/polar_whs_ prefix — but a spec-style stripped+base64 key is tried
// too so either secret generation scheme verifies.
function hmacKeys(secret: string): Buffer[] {
  const keys = [Buffer.from(secret, 'utf8')]
  const stripped = secret.replace(/^(whsec_|polar_whs_)/, '')
  if (stripped !== secret) {
    try {
      keys.push(Buffer.from(stripped, 'base64'))
    } catch { /* not base64 — literal key already covered */ }
  }
  return keys
}

export function verifySignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string): boolean {
  if (!id || !timestamp || !signatureHeader || !secret) return false
  const ts = Number(timestamp) * 1000
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) return false

  const signed = `${id}.${timestamp}.${rawBody}`
  const offered = signatureHeader
    .split(' ')
    .map((part) => part.startsWith('v1,') ? part.slice(3) : null)
    .filter((sig): sig is string => Boolean(sig))
  if (!offered.length) return false

  return hmacKeys(secret).some((key) => {
    const expected = createHmac('sha256', key).update(signed).digest('base64')
    return offered.some((sig) => safeEqual(expected, sig))
  })
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'canceled', 'past_due'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const secret = process.env.POLAR_WEBHOOK_SECRET
  if (!secret) {
    console.error('POLAR_WEBHOOK_SECRET is not set')
    return res.status(503).json({ error: 'Webhook is not configured' })
  }

  let rawBody: string
  try {
    rawBody = (await readRawBody(req)).toString('utf8')
  } catch {
    return res.status(400).json({ error: 'Could not read body' })
  }

  const valid = verifySignature(
    rawBody,
    headerValue(req, 'webhook-id'),
    headerValue(req, 'webhook-timestamp'),
    headerValue(req, 'webhook-signature'),
    secret
  )
  if (!valid) {
    return res.status(403).json({ error: 'Invalid signature' })
  }

  let event: { type?: string; data?: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  // Only subscription state drives entitlement; other event types are ACKed.
  if (typeof event.type !== 'string' || !event.type.startsWith('subscription.')) {
    return res.status(200).json({ ok: true, ignored: event.type || 'unknown' })
  }

  const data = event.data || {}
  const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>
  const customer = (data.customer && typeof data.customer === 'object' ? data.customer : {}) as Record<string, unknown>
  // Checkout stamps metadata.email with the sync email — that is the billing
  // identity. Polar copies it to the subscription, so it wins over whatever
  // (possibly different) email the payer typed on the hosted checkout page.
  const email = String(metadata.email || customer.email || data.customer_email || '').trim().toLowerCase()
  const status = String(data.status || '')
  if (!email || !status) {
    return res.status(200).json({ ok: true, ignored: 'missing email/status' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Redis unavailable' })
  }

  try {
    const periodEnd = typeof data.current_period_end === 'string' ? Date.parse(data.current_period_end) : NaN
    await kv.hset(BILLING_KEY, {
      [email]: {
        status: ACTIVE_STATUSES.has(status) ? status : 'inactive',
        rawStatus: status,
        subscriptionId: typeof data.id === 'string' ? data.id : undefined,
        customerId: typeof data.customer_id === 'string' ? data.customer_id : undefined,
        currentPeriodEnd: Number.isFinite(periodEnd) ? periodEnd : undefined,
        updatedAt: Date.now()
      }
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Billing webhook store error:', err)
    return res.status(500).json({ error: 'Could not store billing state' })
  }
}
