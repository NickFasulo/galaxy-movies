import { describe, expect, it } from 'vitest'
import { matchWatchEntry, mergeWatchTitles, parseWatchEntry, MAX_WATCH_TITLES, type WatchEntry } from './titleAlerts'
import type { ProviderChanges } from '../catalog/streamingChanges'

const changes = (overrides: Partial<ProviderChanges>): ProviderChanges => ({
  source: 'Netflix',
  updatedAt: 0,
  added: [],
  left: [],
  coming: [],
  ...overrides
})

const entry = (titles: WatchEntry['titles']): WatchEntry => ({ unsub: 'u1', titles })

describe('parseWatchEntry', () => {
  it('accepts a stored entry and drops malformed titles', () => {
    expect(parseWatchEntry({ unsub: 'u', titles: [{ tmdbId: 5, tmdbType: 'movie', title: 'X' }, { title: 'bad' }] }))
      .toEqual({ unsub: 'u', titles: [{ tmdbId: 5, tmdbType: 'movie', title: 'X' }] })
  })
  it('rejects non-entry shapes', () => {
    expect(parseWatchEntry(null)).toBeNull()
    expect(parseWatchEntry({ titles: [] })).toBeNull()
  })
})

describe('mergeWatchTitles', () => {
  it('dedupes by type+id and caps the list', () => {
    const titles = Array.from({ length: MAX_WATCH_TITLES }, (_, i) => ({ tmdbId: i, tmdbType: 'movie' as const, title: `T${i}` }))
    const merged = mergeWatchTitles(titles, { tmdbId: 5, tmdbType: 'movie', title: 'T5 new' })
    expect(merged).toHaveLength(MAX_WATCH_TITLES)
    expect(merged[0].title).toBe('T5 new')
    expect(merged.filter((t) => t.tmdbId === 5)).toHaveLength(1)
  })
})

describe('matchWatchEntry', () => {
  const usChanges = {
    netflix: changes({
      added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }],
      coming: [{ tmdbId: 20, tmdbType: 'tv' as const, title: 'Show', date: '2026-11-01', season: 2 }],
      left: [{ tmdbId: 30, tmdbType: 'movie' as const, title: 'Gone', year: 1999 }]
    }),
    hulu: changes({ source: 'Hulu', added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }] })
  }

  it('matches tracked titles across every provider and kind', () => {
    const { matches, arrived } = matchWatchEntry(
      entry([
        { tmdbId: 10, tmdbType: 'movie', title: 'Dune' },
        { tmdbId: 20, tmdbType: 'tv', title: 'Show' },
        { tmdbId: 30, tmdbType: 'movie', title: 'Gone' },
        { tmdbId: 99, tmdbType: 'movie', title: 'Elsewhere' }
      ]),
      usChanges,
      new Set()
    )
    expect(matches.map((m) => `${m.kind}:${m.tmdbId}@${m.provider}`)).toEqual([
      'added:10@Netflix',
      'coming:20@Netflix',
      'leaving:30@Netflix',
      'added:10@Hulu'
    ])
    expect([...arrived]).toEqual(['movie:10'])
  })

  it('skips already-notified events', () => {
    const { matches } = matchWatchEntry(
      entry([{ tmdbId: 10, tmdbType: 'movie', title: 'Dune' }]),
      usChanges,
      new Set(['watch:added:movie:10@netflix', 'watch:added:movie:10@hulu'])
    )
    expect(matches).toHaveLength(0)
  })

  it('does not mark coming/leaving as arrival', () => {
    const { arrived } = matchWatchEntry(
      entry([
        { tmdbId: 20, tmdbType: 'tv', title: 'Show' },
        { tmdbId: 30, tmdbType: 'movie', title: 'Gone' }
      ]),
      usChanges,
      new Set()
    )
    expect(arrived.size).toBe(0)
  })
})

import { vi, beforeEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { buildWatchEmail, sendTitleWatchAlerts } from './titleAlerts'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(opts: { to: string; subject: string; html: string; headers?: Record<string, string> }) => Promise<boolean>>(async () => true)
}))

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('../../lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/email')>()),
  sendEmail: mocks.sendEmail
}))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()

const tracked = (titles: { tmdbId: number; tmdbType: 'movie' | 'tv'; title: string }[]) =>
  ({ unsub: 'tok123', titles })

const providerChanges = (overrides: Partial<ProviderChanges>): ProviderChanges => ({
  source: 'Netflix',
  updatedAt: 0,
  added: [],
  left: [],
  coming: [],
  ...overrides
})

describe('buildWatchEmail', () => {
  it('builds an itemized email with an unsubscribe link and List-Unsubscribe header', () => {
    const { html, headers } = buildWatchEmail([
      { kind: 'added', notifiedKey: 'k', tmdbId: 5, tmdbType: 'movie', title: 'Dune', provider: 'Netflix' },
      { kind: 'coming', notifiedKey: 'k2', tmdbId: 6, tmdbType: 'tv', title: 'Show', provider: 'Hulu', date: '20260201', season: 2 }
    ], 'user@example.com', 'tok123')
    expect(html).toContain('Dune')
    expect(html).toContain('Now streaming on Netflix')
    expect(html).toContain('Coming to Hulu')
    expect(html).toContain('season 2')
    expect(html).toContain('https://www.galaxymovies.app/tv/6')
    const unsub = 'https://www.galaxymovies.app/api/waitlist-remove?email=user%40example.com&token=tok123'
    expect(html).toContain(unsub)
    expect(headers['List-Unsubscribe']).toBe(`<${unsub}>`)
  })

  it('escapes HTML in titles and provider names', () => {
    const { html } = buildWatchEmail([
      { kind: 'added', notifiedKey: 'k', tmdbId: 5, tmdbType: 'movie', title: '<b>X</b>', provider: 'A & B' }
    ], 'u@e.com', 't')
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
    expect(html).toContain('A &amp; B')
    expect(html).not.toContain('<b>X</b>')
  })
})

describe('sendTitleWatchAlerts', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
    mocks.sendEmail.mockResolvedValue(true)
  })

  it('returns zeros when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(sendTitleWatchAlerts({}, {})).resolves.toEqual({ sent: 0, failed: 0, tracked: 0 })
  })

  it('returns zeros when nobody is tracking titles', async () => {
    await expect(sendTitleWatchAlerts({}, {})).resolves.toEqual({ sent: 0, failed: 0, tracked: 0 })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('sends a matched alert, removes the arrived title, and records notified keys', async () => {
    fake.map.set('gm:alerts:watch', {
      'u@e.com': tracked([{ tmdbId: 10, tmdbType: 'movie', title: 'Dune' }])
    })
    const usChanges = {
      netflix: providerChanges({ added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }] })
    }
    const result = await sendTitleWatchAlerts(usChanges, {})
    expect(result).toEqual({ sent: 1, failed: 0, tracked: 1 })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    const sent = mocks.sendEmail.mock.calls[0][0]
    expect(sent.to).toBe('u@e.com')
    expect(sent.subject).toContain('Dune')
    // The arrived title ends tracking — hash entry removed.
    expect(fake.map.has('gm:alerts:watch')).toBe(false)
    const notified = fake.map.get('gm:alerts:notified') as Record<string, string[]>
    expect(notified['u@e.com']).toContain('watch:added:movie:10@netflix')
  })

  it('keeps tracking a title when only coming/leaving matched', async () => {
    fake.map.set('gm:alerts:watch', {
      'u@e.com': tracked([{ tmdbId: 20, tmdbType: 'tv', title: 'Show' }])
    })
    const usChanges = {
      netflix: providerChanges({ coming: [{ tmdbId: 20, tmdbType: 'tv' as const, title: 'Show', date: '2026-12-01', season: 1 }] })
    }
    const result = await sendTitleWatchAlerts(usChanges, {})
    expect(result.sent).toBe(1)
    const stored = fake.map.get('gm:alerts:watch') as Record<string, { titles: unknown[] }>
    expect(stored['u@e.com'].titles).toHaveLength(1)
  })

  it('counts a send failure without mutating the watch entry', async () => {
    const entry = tracked([{ tmdbId: 10, tmdbType: 'movie', title: 'Dune' }])
    fake.map.set('gm:alerts:watch', { 'u@e.com': entry })
    mocks.sendEmail.mockResolvedValue(false)
    const usChanges = {
      netflix: providerChanges({ added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }] })
    }
    const result = await sendTitleWatchAlerts(usChanges, {})
    expect(result).toEqual({ sent: 0, failed: 1, tracked: 1 })
    expect(fake.map.get('gm:alerts:watch')).toEqual({ 'u@e.com': entry })
    expect(fake.map.has('gm:alerts:notified')).toBe(false)
  })

  it('skips entries already notified for the same event', async () => {
    fake.map.set('gm:alerts:watch', {
      'u@e.com': tracked([{ tmdbId: 10, tmdbType: 'movie', title: 'Dune' }])
    })
    const usChanges = {
      netflix: providerChanges({ added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }] })
    }
    const result = await sendTitleWatchAlerts(usChanges, {
      'u@e.com': ['watch:added:movie:10@netflix']
    })
    expect(result.sent).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})
