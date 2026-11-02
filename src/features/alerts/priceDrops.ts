import { getRedis } from '../../lib/redis'
import { sendEmail, emailLayout, emailListRows, escapeHtml } from '../../lib/email'
import { getPriceOffers, type PricePayload } from '../catalog/prices'
import { getOrCreateSyncKey, PRICE_DROPS_KEY, WATCH_KEY } from './waitlistStore'
import { manageLink } from '../billing/billing'
import { SITE_URL } from '../../lib/site'
import type { MediaType } from '../../types/tmdb'
import type { Redis } from '@upstash/redis'

// Watchmode quota is the scarce upstream resource — a weekly run must stay
// well under the daily lookup budget shared with /api/prices traffic.
export const MAX_PRICE_DROPS = 20
export const MAX_LOOKUPS_PER_RUN = 60
// Stale targets cost a credit every week forever; a year without a drop is
// enough to retire the watch.
const MAX_TARGET_AGE_MS = 365 * 24 * 60 * 60 * 1000

export interface PriceDropTarget {
  tmdbId: number
  tmdbType: MediaType
  title: string
  addedAt: number
  // Last check's cheapest rent/buy price — shown as "was $X" in the email.
  prevMin: number | null
  // Lowest price ever observed — an alert only fires on a new all-time low,
  // which dedupes repeat dips to the same price.
  minSeen: number | null
}

export interface PriceDropEntry {
  targets: PriceDropTarget[]
}

export function parsePriceDropEntry(raw: unknown): PriceDropEntry | null {
  if (!raw) return null
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof obj !== 'object' || obj === null || !Array.isArray((obj as PriceDropEntry).targets)) return null
  const targets = (obj as { targets: unknown[] }).targets.filter(
    (t): t is PriceDropTarget =>
      typeof (t as PriceDropTarget)?.tmdbId === 'number' &&
      typeof (t as PriceDropTarget)?.title === 'string' &&
      ((t as PriceDropTarget)?.tmdbType === 'movie' || (t as PriceDropTarget)?.tmdbType === 'tv')
  )
  return { targets }
}

export async function addPriceDrop(kv: Redis, email: string, target: Pick<PriceDropTarget, 'tmdbId' | 'tmdbType' | 'title'>): Promise<{ added: boolean; count: number }> {
  const entry = parsePriceDropEntry(await kv.hget(PRICE_DROPS_KEY, email)) || { targets: [] }
  const key = (t: PriceDropTarget) => `${t.tmdbType}:${t.tmdbId}`
  const rest = entry.targets.filter((t) => key(t) !== `${target.tmdbType}:${target.tmdbId}`)
  const targets = [{ ...target, addedAt: Date.now(), prevMin: null, minSeen: null }, ...rest].slice(0, MAX_PRICE_DROPS)
  await kv.hset(PRICE_DROPS_KEY, { [email]: { targets } })
  return { added: targets.length > rest.length, count: targets.length }
}

export async function removePriceDrop(kv: Redis, email: string, tmdbId: number, tmdbType: MediaType): Promise<void> {
  const entry = parsePriceDropEntry(await kv.hget(PRICE_DROPS_KEY, email))
  if (!entry) return
  const targets = entry.targets.filter((t) => !(t.tmdbId === tmdbId && t.tmdbType === tmdbType))
  if (targets.length) {
    await kv.hset(PRICE_DROPS_KEY, { [email]: { targets } })
  } else {
    await kv.hdel(PRICE_DROPS_KEY, email)
  }
}

function minPrice(payload: PricePayload): number | null {
  const prices = [payload.cheapest.rent?.price, payload.cheapest.buy?.price].filter((p): p is number => p != null)
  return prices.length ? Math.min(...prices) : null
}

const money = (n: number) => `$${n.toFixed(2)}`

export function buildPriceDropEmail(items: { target: PriceDropTarget; prev: number; now: number; rent: string | null; buy: string | null }[], email: string, unsubToken: string, manageUrl?: string | null) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${unsubToken}`
  const rows = emailListRows(
    items.map(({ target, prev, now, rent, buy }) => ({
      href: `${SITE_URL}/${target.tmdbType === 'tv' ? 'tv' : 'movies'}/${target.tmdbId}`,
      title: escapeHtml(target.title),
      line: `Lowest price yet: <b>${money(now)}</b> (was ${money(prev)})${rent ? ` · rent ${rent}` : ''}${buy ? ` · buy ${buy}` : ''}`
    }))
  )

  const html = emailLayout({
    heading: 'A tracked title just dropped in price',
    preheader: `${items.length} price drop${items.length === 1 ? '' : 's'} on titles you're tracking`,
    body: `
      <p style="margin: 0 0 14px; color: #4b5563; line-height: 1.6;">These rentals or purchases hit a new low since your last check.</p>
      ${rows}
      <p style="margin: 22px 0 0;"><a href="${manageUrl || SITE_URL}" style="color: #1d4ed8; font-weight: 600; text-decoration: none;">${manageUrl ? 'Manage your alerts →' : 'Track another title →'}</a></p>`,
    reason: 'You asked Galaxy Movies to watch rental and purchase prices.',
    unsubUrl: unsub
  })
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

// Weekly job: fetch each tracked title once per run (deduped across
// subscribers), email anyone whose title hit a new all-time low, and fold the
// fresh minima back into the stored records.
export async function sendPriceDropAlerts(): Promise<{ sent: number; failed: number; tracked: number; lookups: number; pruned: number }> {
  const kv = getRedis()
  const result = { sent: 0, failed: 0, tracked: 0, lookups: 0, pruned: 0 }
  if (!kv) return result

  const hash = (await kv.hgetall<Record<string, unknown>>(PRICE_DROPS_KEY)) || {}
  const emails = Object.keys(hash)
  if (!emails.length) return result

  // Unique targets across all subscribers, capped before any upstream spend.
  const unique = new Map<string, PriceDropTarget>()
  const entries = new Map<string, PriceDropEntry>()
  const now = Date.now()
  for (const email of emails) {
    const entry = parsePriceDropEntry(hash[email])
    if (!entry) continue
    entry.targets = entry.targets.filter((t) => {
      const keep = now - t.addedAt < MAX_TARGET_AGE_MS
      if (!keep) result.pruned++
      return keep
    })
    entries.set(email, entry)
    for (const t of entry.targets) {
      const key = `${t.tmdbType}:${t.tmdbId}`
      if (!unique.has(key)) unique.set(key, t)
    }
  }

  const prices = new Map<string, PricePayload>()
  for (const [key, t] of unique) {
    if (result.lookups >= MAX_LOOKUPS_PER_RUN) break
    result.lookups++
    const payload = await getPriceOffers({ tmdbId: t.tmdbId, mediaType: t.tmdbType, title: t.title }).catch(() => null)
    if (payload) prices.set(key, payload)
  }

  for (const [email, entry] of entries) {
    result.tracked += entry.targets.length
    const drops: { target: PriceDropTarget; prev: number; now: number; rent: string | null; buy: string | null }[] = []
    for (const t of entry.targets) {
      const payload = prices.get(`${t.tmdbType}:${t.tmdbId}`)
      const current = payload ? minPrice(payload) : null
      if (current == null) continue
      const prev = t.prevMin
      t.prevMin = current
      if (t.minSeen == null || current < t.minSeen) {
        drops.push({
          target: t,
          prev: prev ?? current,
          now: current,
          rent: payload!.cheapest.rent?.price != null ? `${money(payload!.cheapest.rent.price)} on ${payload!.cheapest.rent.provider}` : null,
          buy: payload!.cheapest.buy?.price != null ? `${money(payload!.cheapest.buy.price)} on ${payload!.cheapest.buy.provider}` : null
        })
        t.minSeen = current
      }
    }

    if (!entry.targets.length) {
      await kv.hdel(PRICE_DROPS_KEY, email)
      continue
    }
    await kv.hset(PRICE_DROPS_KEY, { [email]: entry })
    if (!drops.length) continue

    // Reuse the title-watch unsubscribe token so a title-only subscriber still
    // gets a working one-click opt-out of these emails.
    const watch = await kv.hget<{ unsub?: string }>(WATCH_KEY, email)
    const unsubToken = watch?.unsub
    if (!unsubToken) continue
    const syncKey = await getOrCreateSyncKey(kv, email).catch(() => null)
    const { html, headers } = buildPriceDropEmail(drops, email, unsubToken, syncKey ? manageLink(email, syncKey) : null)
    const subject = drops.length === 1
      ? `Price drop: ${drops[0].target.title} now ${money(drops[0].now)}`
      : `${drops.length} price drops on your tracked titles`
    const ok = await sendEmail({ to: email, subject, html, headers })
    if (ok) result.sent++
    else result.failed++
  }

  return result
}
