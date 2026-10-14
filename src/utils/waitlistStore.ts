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

// email => JSON { refreshToken } — Trakt OAuth refresh token for Plus sync.
export const TRAKT_KEY = 'gm:alerts:trakt'
// email => discord webhook URL — Plus subscribers' opt-in alert channel.
export const DISCORD_KEY = 'gm:alerts:discord'

export const TELEGRAM_KEY = 'gm:alerts:telegram'
// email => JSON [{endpoint, keys:{p256dh, auth}, createdAt}] — one entry per
// device/browser the subscriber enabled Web Push on.
export const PUSH_KEY = 'gm:alerts:push'
// email => shareId — Plus-only read-only share token; deliberately separate
// from SYNCKEY_KEY, which is a write credential and must never leak into a URL.
export const SHARE_KEY = 'gm:alerts:share'
// shareId => email — reverse index so a share link resolves without scanning.
export const SHARE_LOOKUP_KEY = 'gm:share:lookup'
// email => JSON { messages, links, updatedAt } — Plus chat history, ≤30 turns.
export const CHAT_HISTORY_KEY = 'gm:alerts:chat'

export async function getOrCreateSyncKey(kv: Redis, email: string): Promise<string> {
  const existing = await kv.hget<string>(SYNCKEY_KEY, email)
  if (existing) return existing
  const key = randomUUID()
  await kv.hset(SYNCKEY_KEY, { [email]: key })
  return key
}
