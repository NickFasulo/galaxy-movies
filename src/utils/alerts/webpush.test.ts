import { describe, expect, it } from 'vitest'
import {
  buildPushPayload,
  isPushEndpoint,
  mergePushSub,
  parsePushSubscription,
  parseStoredSubs,
  MAX_PUSH_SUBS,
  type StoredPushSub
} from './webpush'
import type { MatchedItem } from './watchlistAlerts'

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123'
const APPLE = 'https://web.push.apple.com/Qabc123'
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/abc'
const WNS = 'https://wns2-by3p.notify.windows.com/w/?token=abc'

const sub = (endpoint: string, createdAt?: number): StoredPushSub => ({
  endpoint,
  keys: { p256dh: 'BKeyMaterial', auth: 'authSecret' },
  createdAt
})

describe('isPushEndpoint', () => {
  it('accepts the major push services', () => {
    for (const ep of [FCM, APPLE, MOZ, WNS]) expect(isPushEndpoint(ep)).toBe(true)
  })

  it('rejects http, non-push hosts, and junk', () => {
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isPushEndpoint('https://evil.example.com/x')).toBe(false)
    expect(isPushEndpoint('https://fakepush.apple.com/x')).toBe(false)
    expect(isPushEndpoint('not a url')).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
    expect(isPushEndpoint('')).toBe(false)
  })
})

describe('parsePushSubscription', () => {
  it('round-trips a real subscription JSON', () => {
    expect(parsePushSubscription({ endpoint: FCM, keys: { p256dh: 'pk', auth: 'ak' } }))
      .toEqual({ endpoint: FCM, keys: { p256dh: 'pk', auth: 'ak' } })
  })

  it('rejects missing keys or bad endpoints', () => {
    expect(parsePushSubscription({ endpoint: FCM })).toBeNull()
    expect(parsePushSubscription({ endpoint: FCM, keys: { p256dh: 'pk' } })).toBeNull()
    expect(parsePushSubscription({ endpoint: 'https://evil.example.com', keys: { p256dh: 'pk', auth: 'ak' } })).toBeNull()
    expect(parsePushSubscription('x')).toBeNull()
  })
})

describe('parseStoredSubs', () => {
  it('keeps createdAt and drops invalid entries', () => {
    const out = parseStoredSubs([sub(FCM, 123), { endpoint: 'x' }, 'junk', sub(APPLE)])
    expect(out).toHaveLength(2)
    expect(out[0].createdAt).toBe(123)
    expect(out[1].createdAt).toBeUndefined()
  })

  it('returns [] for non-arrays and caps at MAX_PUSH_SUBS', () => {
    expect(parseStoredSubs({})).toEqual([])
    expect(parseStoredSubs(new Array(9).fill(sub(FCM)))).toHaveLength(MAX_PUSH_SUBS)
  })
})

describe('mergePushSub', () => {
  it('dedupes by endpoint and evicts the oldest when full', () => {
    const existing = [sub(FCM, 1), sub(APPLE, 2)]
    const merged = mergePushSub(existing, sub(FCM))
    expect(merged.map((s) => s.endpoint)).toEqual([APPLE, FCM])

    const full = ['e1', 'e2', 'e3', 'e4', 'e5'].map((e) => sub(`https://fcm.googleapis.com/${e}`))
    const evicted = mergePushSub(full, sub('https://fcm.googleapis.com/e6'))
    expect(evicted).toHaveLength(MAX_PUSH_SUBS)
    expect(evicted.map((s) => s.endpoint)).not.toContain('https://fcm.googleapis.com/e1')
    expect(evicted[evicted.length - 1].endpoint).toBe('https://fcm.googleapis.com/e6')
  })
})

const item = (overrides: Partial<MatchedItem>): MatchedItem => ({
  kind: 'added',
  notifiedKey: 'k',
  tmdbId: 1,
  tmdbType: 'movie',
  title: 'Dune',
  provider: 'Netflix',
  ...overrides
})

describe('buildPushPayload', () => {
  it('lists matches and collapses the tail', () => {
    const items = [
      item({ title: 'A' }),
      item({ title: 'B', kind: 'coming', date: '2026-11-02' }),
      item({ title: 'C', kind: 'leaving' }),
      item({ title: 'D' }),
      item({ title: 'E' }),
      item({ title: 'F' })
    ]
    const p = buildPushPayload(items)
    expect(p.title).toBe('Something on your list just moved')
    expect(p.body).toContain('A — Now on Netflix')
    expect(p.body).toContain('B — Coming to Netflix, Nov 2')
    expect(p.body).toContain('C — Leaving Netflix soon')
    expect(p.body).not.toContain('E —')
    expect(p.body).toContain('…and 2 more')
    expect(p.url).toBe('/watchlist')
  })
})
