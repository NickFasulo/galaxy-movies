import { describe, expect, it } from 'vitest'
import { buildEmail, matchItems, parsePrefs, type AlertPrefs, type MatchedItem } from './watchlistAlerts'
import type { CatalogTitle, ProviderChanges } from './streamingChanges'

const catalogTitle = (tmdbId: number | null, tmdbType: 'movie' | 'tv' = 'movie'): CatalogTitle => ({
  tmdbId,
  tmdbType,
  title: `Title ${tmdbId}`,
  year: 2024
})

const providerChanges = (overrides: Partial<ProviderChanges> = {}): ProviderChanges => ({
  source: 'Netflix',
  updatedAt: 0,
  added: [],
  left: [],
  coming: [],
  ...overrides
})

const prefs = (overrides: Partial<AlertPrefs> = {}): AlertPrefs => ({
  watchlist: [{ id: 1, mediaType: 'movie', title: 'Title 1' }],
  services: ['netflix'],
  region: 'US',
  updatedAt: 0,
  ...overrides
})

describe('parsePrefs', () => {
  it('returns stored prefs for a valid object', () => {
    const stored = prefs()
    expect(parsePrefs(stored)).toBe(stored)
  })

  it.each([null, undefined, 'string', 42, {}, { watchlist: 'x', services: [] }, { watchlist: [], services: {} }])(
    'returns null for malformed value %j',
    (raw) => expect(parsePrefs(raw)).toBeNull()
  )
})

describe('matchItems', () => {
  it('matches a watchlisted title in a subscribed provider\'s added list', () => {
    const matches = matchItems(prefs(), { netflix: providerChanges({ added: [catalogTitle(1)] }) }, new Set())
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'added', tmdbId: 1, provider: 'Netflix' })
  })

  it('ignores providers the subscriber did not choose', () => {
    const matches = matchItems(prefs(), { hulu: providerChanges({ added: [catalogTitle(1)] }) }, new Set())
    expect(matches).toHaveLength(0)
  })

  it('does not match the same tmdbId under a different media type', () => {
    const matches = matchItems(prefs(), { netflix: providerChanges({ added: [catalogTitle(1, 'tv')] }) }, new Set())
    expect(matches).toHaveLength(0)
  })

  it('skips entries already in the notified set', () => {
    const notified = new Set(['added:movie:1@netflix'])
    const matches = matchItems(prefs(), { netflix: providerChanges({ added: [catalogTitle(1)] }) }, notified)
    expect(matches).toHaveLength(0)
  })

  it('skips items with no tmdbId', () => {
    const matches = matchItems(prefs(), { netflix: providerChanges({ added: [catalogTitle(null)] }) }, new Set())
    expect(matches).toHaveLength(0)
  })

  it('marks coming releases with date and season', () => {
    const changes = {
      netflix: providerChanges({
        coming: [{ tmdbId: 1, tmdbType: 'tv' as const, title: 'Title 1', date: '20260115', season: 2 }]
      })
    }
    const matches = matchItems(prefs({ watchlist: [{ id: 1, mediaType: 'tv', title: 'Title 1' }] }), changes, new Set())
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'coming', date: '20260115', season: 2, notifiedKey: 'coming:tv:1@netflix' })
  })

  it('caps matches at 20 per email', () => {
    const many = Array.from({ length: 25 }, (_, i) => catalogTitle(i + 1))
    const watchlist = many.map((t) => ({ id: t.tmdbId!, mediaType: 'movie' as const, title: t.title }))
    const matches = matchItems(
      prefs({ watchlist }),
      { netflix: providerChanges({ added: many }) },
      new Set()
    )
    expect(matches).toHaveLength(20)
  })
})

describe('buildEmail', () => {
  const item: MatchedItem = {
    kind: 'added',
    notifiedKey: 'added:movie:1@netflix',
    tmdbId: 1,
    tmdbType: 'movie',
    title: 'Some Film',
    provider: 'Netflix'
  }

  it('escapes HTML in titles and links to the title page', () => {
    const { html } = buildEmail([{ ...item, title: '<img src=x onerror=alert(1)>' }], 'a@b.com', 'tok')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html).toContain('/movies/1')
  })

  it('includes an unsubscribe link with the subscriber token', () => {
    const { html, headers } = buildEmail([item], 'user@example.com', 'secret-token')
    expect(html).toContain('email=user%40example.com')
    expect(html).toContain('token=secret-token')
    expect(headers['List-Unsubscribe']).toContain('token=secret-token')
  })

  it('renders coming releases with provider, formatted date, and season', () => {
    const coming: MatchedItem = { ...item, kind: 'coming', tmdbType: 'tv', provider: 'Hulu', date: '20260115', season: 2 }
    const { html } = buildEmail([coming], 'a@b.com', 'tok')
    expect(html).toContain('Coming to Hulu, Jan 15, season 2')
    expect(html).toContain('/tv/1')
  })
})
