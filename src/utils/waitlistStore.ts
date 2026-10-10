import { randomUUID } from 'crypto'
import type { Redis } from '@upstash/redis'
export { getRedis } from './redis'

// Confirmed signups live in one hash, unconfirmed in another — email => token.
// The token gates both confirmation and unsubscribe links (shared secret in
// the link we send, so possession of the email = authorization).
export const PENDING_KEY = 'gm:waitlist:pending'
export const CONFIRMED_KEY = 'gm:waitlist:confirmed'

// Separate from CONFIRMED_KEY's token on purpose: this one is handed to the
// client and sent on every watchlist/service edit, so it's a durable bearer
// credential rather than a one-click link secret. Rotating/compromising it
// never touches the confirm/unsubscribe token or vice versa.
export const SYNCKEY_KEY = 'gm:alerts:synckey'
// email => JSON { watchlist, services, region, updatedAt }
export const ALERTS_PREFS_KEY = 'gm:alerts:prefs'
// email => JSON string[] of already-sent "kind:type:id@provider" keys
export const ALERTS_NOTIFIED_KEY = 'gm:alerts:notified'
// email => JSON { status, subscriptionId, customerId, currentPeriodEnd, updatedAt } —
// written only by the Polar webhook, never by client-facing routes.
export const BILLING_KEY = 'gm:billing'

export async function getOrCreateSyncKey(kv: Redis, email: string): Promise<string> {
  const existing = await kv.hget<string>(SYNCKEY_KEY, email)
  if (existing) return existing
  const key = randomUUID()
  await kv.hset(SYNCKEY_KEY, { [email]: key })
  return key
}
