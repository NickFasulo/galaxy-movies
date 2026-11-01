import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRedis } from '../../lib/redis'
import {
  addPriceDrop, buildPriceDropEmail, MAX_LOOKUPS_PER_RUN, MAX_PRICE_DROPS,
  parsePriceDropEntry, removePriceDrop, sendPriceDropAlerts
} from './priceDrops'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'
import type { PricePayload } from '../catalog/prices'
import type { Redis } from '@upstash/redis'

const kv = () => fake.kv as unknown as Redis

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(opts: { to: string; subject: string; html: string }) => Promise<boolean>>(async () => true),
  getPriceOffers: vi.fn<() => Promise<PricePayload | null>>(async () => null)
}))

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('../../lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/email')>()),
  sendEmail: mocks.sendEmail
}))
vi.mock('../catalog/prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalog/prices')>()),
  getPriceOffers: mocks.getPriceOffers
}))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()

const payload = (rent: number | null, buy: number | null): PricePayload => ({
  region: 'US',
  fetchedAt: 0,
  offers: [],
  cheapest: {
    rent: rent != null ? { provider: 'Apple TV', store: 'watchmode', type: 'rent', format: 'HD', price: rent, currency: 'USD', url: null, seasons: null } : null,
    buy: buy != null ? { provider: 'Apple TV', store: 'watchmode', type: 'buy', format: 'HD', price: buy, currency: 'USD', url: null, seasons: null } : null
  },
  extras: { criticScore: null, userRating: null, relevancePercentile: null, gruv: null }
})

const target = (overrides: Record<string, unknown> = {}) => ({
  tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune',
  addedAt: Date.now(), prevMin: null, minSeen: null, ...overrides
})

describe('parsePriceDropEntry', () => {
  it('accepts a stored entry and drops malformed targets', () => {
    expect(parsePriceDropEntry({ targets: [target(), { title: 'bad' }] })?.targets).toHaveLength(1)
    expect(parsePriceDropEntry(JSON.stringify({ targets: [target()] }))?.targets).toHaveLength(1)
  })
  it('rejects non-entry shapes', () => {
    expect(parsePriceDropEntry(null)).toBeNull()
    expect(parsePriceDropEntry('not json')).toBeNull()
    expect(parsePriceDropEntry({})).toBeNull()
  })
})

describe('addPriceDrop / removePriceDrop', () => {
  beforeEach(() => {
    fake.map.clear()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('adds, dedupes by type+id, and caps the list', async () => {
    await addPriceDrop(kv(), 'u@e.com', { tmdbId: 1, tmdbType: 'movie', title: 'A' })
    const again = await addPriceDrop(kv(), 'u@e.com', { tmdbId: 1, tmdbType: 'movie', title: 'A renamed' })
    expect(again.count).toBe(1)
    expect(parsePriceDropEntry((fake.map.get('gm:alerts:pricedrops') as Record<string, unknown>)['u@e.com'])!.targets[0].title).toBe('A renamed')

    for (let i = 2; i <= MAX_PRICE_DROPS + 5; i++) {
      await addPriceDrop(kv(), 'u@e.com', { tmdbId: i, tmdbType: 'movie', title: `T${i}` })
    }
    expect(parsePriceDropEntry((fake.map.get('gm:alerts:pricedrops') as Record<string, unknown>)['u@e.com'])!.targets).toHaveLength(MAX_PRICE_DROPS)
  })

  it('removes a target and deletes the field when empty', async () => {
    await addPriceDrop(kv(), 'u@e.com', { tmdbId: 1, tmdbType: 'movie', title: 'A' })
    await removePriceDrop(kv(), 'u@e.com', 1, 'movie')
    expect(fake.map.has('gm:alerts:pricedrops')).toBe(false)
  })
})

describe('buildPriceDropEmail', () => {
  it('builds an itemized email with old and new prices', () => {
    const { html, headers } = buildPriceDropEmail(
      [{ target: target(), prev: 3.99, now: 1.99, rent: '$1.99 on Apple TV', buy: null }],
      'u@e.com', 'tok1', 'https://www.galaxymovies.app/alerts#email=u%40e.com&key=k'
    )
    expect(html).toContain('Dune')
    expect(html).toContain('$1.99')
    expect(html).toContain('$3.99')
    expect(html).toContain('Manage your alerts')
    expect(headers['List-Unsubscribe']).toContain('waitlist-remove')
  })
})

describe('sendPriceDropAlerts', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
    mocks.sendEmail.mockResolvedValue(true)
    fake.map.set('gm:alerts:watch', { 'u@e.com': { unsub: 'tok1', titles: [] } })
  })

  const seed = (t = target(), email = 'u@e.com') => {
    fake.map.set('gm:alerts:pricedrops', { [email]: { targets: [t] } })
  }

  it('returns zeros when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(sendPriceDropAlerts()).resolves.toMatchObject({ sent: 0, tracked: 0, lookups: 0 })
  })

  it('emails on a new all-time low and records the fresh minima', async () => {
    seed(target({ prevMin: 3.99, minSeen: 3.99 }))
    mocks.getPriceOffers.mockResolvedValue(payload(1.99, 4.99))
    const result = await sendPriceDropAlerts()
    expect(result).toMatchObject({ sent: 1, failed: 0, tracked: 1, lookups: 1 })
    expect(mocks.sendEmail.mock.calls[0][0].subject).toContain('Dune')
    const stored = parsePriceDropEntry((fake.map.get('gm:alerts:pricedrops') as Record<string, unknown>)['u@e.com'])!.targets[0]
    expect(stored.prevMin).toBe(1.99)
    expect(stored.minSeen).toBe(1.99)
  })

  it('stays quiet when the price is stable or higher', async () => {
    seed(target({ prevMin: 1.99, minSeen: 1.99 }))
    mocks.getPriceOffers.mockResolvedValue(payload(1.99, null))
    expect((await sendPriceDropAlerts()).sent).toBe(0)

    mocks.getPriceOffers.mockResolvedValue(payload(3.99, null))
    expect((await sendPriceDropAlerts()).sent).toBe(0)
    // prevMin still tracks the current price so "was" stays meaningful.
    expect(parsePriceDropEntry((fake.map.get('gm:alerts:pricedrops') as Record<string, unknown>)['u@e.com'])!.targets[0].prevMin).toBe(3.99)
  })

  it('does not re-alert when a dip returns to the same low', async () => {
    seed(target({ prevMin: 2.99, minSeen: 1.99 }))
    mocks.getPriceOffers.mockResolvedValue(payload(1.99, null))
    expect((await sendPriceDropAlerts()).sent).toBe(0)
  })

  it('fetches each title once per run even across subscribers', async () => {
    fake.map.set('gm:alerts:pricedrops', {
      'u@e.com': { targets: [target()] },
      'v@e.com': { targets: [target()] }
    })
    fake.map.set('gm:alerts:watch', { 'u@e.com': { unsub: 'a' }, 'v@e.com': { unsub: 'b' } })
    mocks.getPriceOffers.mockResolvedValue(payload(0.99, null))
    const result = await sendPriceDropAlerts()
    expect(result.lookups).toBe(1)
    expect(result.sent).toBe(2)
  })

  it('caps upstream lookups per run', async () => {
    const targets = Array.from({ length: MAX_LOOKUPS_PER_RUN + 10 }, (_, i) => target({ tmdbId: i }))
    seed()
    fake.map.set('gm:alerts:pricedrops', { 'u@e.com': { targets } })
    mocks.getPriceOffers.mockResolvedValue(payload(1, null))
    const result = await sendPriceDropAlerts()
    expect(result.lookups).toBe(MAX_LOOKUPS_PER_RUN)
  })

  it('skips the email when the subscriber has no unsubscribe token', async () => {
    seed(target(), 'no-watch@e.com')
    mocks.getPriceOffers.mockResolvedValue(payload(0.5, null))
    const result = await sendPriceDropAlerts()
    expect(result.sent).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('prunes targets older than a year', async () => {
    seed(target({ addedAt: Date.now() - 400 * 24 * 60 * 60 * 1000 }))
    mocks.getPriceOffers.mockResolvedValue(payload(1, null))
    const result = await sendPriceDropAlerts()
    expect(result.pruned).toBe(1)
    expect(fake.map.has('gm:alerts:pricedrops')).toBe(false)
  })
})
