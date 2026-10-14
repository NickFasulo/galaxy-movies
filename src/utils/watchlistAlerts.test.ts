import { describe, expect, it } from 'vitest'
import { buildDiscordMessage, buildEmail, matchItems, parsePrefs, type AlertPrefs, type MatchedItem } from './watchlistAlerts'
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

  it('matches watchlisted departures only when leaving alerts are on', () => {
    const changes = { netflix: providerChanges({ left: [catalogTitle(1)] }) }
    expect(matchItems(prefs(), changes, new Set())).toHaveLength(0)
    const matches = matchItems(prefs(), changes, new Set(), { leaving: true })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'leaving', notifiedKey: 'leaving:movie:1@netflix' })
  })

  it('taste-matches added titles against the rec index, crediting the rated title', () => {
    const taste = new Map([['movie:99', 'Inception']])
    const matches = matchItems(
      prefs(),
      { netflix: providerChanges({ added: [catalogTitle(99)] }) },
      new Set(),
      { taste }
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'taste', tmdbId: 99, via: 'Inception' })
  })

  it('does not double-report a watchlisted title as a taste match', () => {
    const taste = new Map([['movie:1', 'Inception']])
    const matches = matchItems(
      prefs(),
      { netflix: providerChanges({ added: [catalogTitle(1)] }) },
      new Set(),
      { taste }
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].kind).toBe('added')
  })

  it('taste matches respect the notified set', () => {
    const taste = new Map([['movie:99', 'Inception']])
    const notified = new Set(['taste:movie:99@netflix'])
    const matches = matchItems(
      prefs(),
      { netflix: providerChanges({ added: [catalogTitle(99)] }) },
      notified,
      { taste }
    )
    expect(matches).toHaveLength(0)
  })

  it('gates provider coverage to the allowlist even when diffs exist', () => {
    const sub = prefs({ services: ['netflix', 'peacock'] })
    const changes = {
      netflix: providerChanges({ added: [catalogTitle(1)] }),
      peacock: providerChanges({ source: 'Peacock', added: [catalogTitle(2)] })
    }
    const wideWatchlist = [...sub.watchlist, { id: 2, mediaType: 'movie' as const, title: 'Title 2' }]
    const free = matchItems(prefs({ ...sub, watchlist: wideWatchlist }), changes, new Set(), {
      providers: ['netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max']
    })
    expect(free.map((m) => m.tmdbId)).toEqual([1])
    const plus = matchItems(prefs({ ...sub, watchlist: wideWatchlist }), changes, new Set(), {
      providers: ['netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max', 'peacock', 'paramount-plus']
    })
    expect(plus.map((m) => m.tmdbId).sort()).toEqual([1, 2])
  })

  it('matches watchlisted shows against the episode index with an episode-scoped key', () => {
    const sub = prefs({ watchlist: [{ id: 7, mediaType: 'tv', title: 'Show' }] })
    const episodes = new Map([[7, { airDate: '2026-02-01', season: 2, episode: 5 }]])
    const matches = matchItems(sub, {}, new Set(), { episodes })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      kind: 'episode',
      tmdbId: 7,
      date: '2026-02-01',
      season: 2,
      episode: 5,
      notifiedKey: 'episode:tv:7@s2e5'
    })
  })

  it('episode matches respect the notified set and ignore movies', () => {
    const sub = prefs({
      watchlist: [
        { id: 7, mediaType: 'tv', title: 'Show' },
        { id: 8, mediaType: 'movie', title: 'Film' }
      ]
    })
    const episodes = new Map([
      [7, { airDate: '2026-02-01', season: 2, episode: 5 }],
      [8, { airDate: '2026-02-01', season: null, episode: null }]
    ])
    const notified = new Set(['episode:tv:7@s2e5'])
    expect(matchItems(sub, {}, notified, { episodes })).toHaveLength(0)
  })
})

describe('buildDiscordMessage', () => {
  const item: MatchedItem = {
    kind: 'added',
    notifiedKey: 'added:movie:1@netflix',
    tmdbId: 1,
    tmdbType: 'movie',
    title: 'Some Film',
    provider: 'Netflix'
  }

  it('renders a single embed with markdown links and a status line', () => {
    const msg = buildDiscordMessage([item])
    expect(msg.embeds).toHaveLength(1)
    expect(msg.embeds[0]!.description).toContain('[Some Film](https://www.galaxymovies.app/movies/1)')
    expect(msg.embeds[0]!.description).toContain('Now on Netflix')
  })

  it('renders coming and taste status lines', () => {
    const coming: MatchedItem = { ...item, kind: 'coming', date: '20260115', season: 2 }
    const taste: MatchedItem = { ...item, kind: 'taste', via: 'Inception' }
    const { embeds } = buildDiscordMessage([coming, taste])
    expect(embeds[0]!.description).toContain('Coming to Netflix, Jan 15, season 2')
    expect(embeds[0]!.description).toContain('because you rated Inception highly')
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

  it('renders leaving and taste rows', () => {
    const leaving: MatchedItem = { ...item, kind: 'leaving' }
    const taste: MatchedItem = { ...item, kind: 'taste', tmdbId: 99, via: 'Inception' }
    const { html } = buildEmail([leaving, taste], 'a@b.com', 'tok')
    expect(html).toContain('Leaving Netflix soon')
    expect(html).toContain('because you rated Inception highly')
  })

  it('renders episode alerts with numbering and air date', () => {
    const ep: MatchedItem = { ...item, kind: 'episode', tmdbType: 'tv', provider: '', date: '2026-02-01', season: 2, episode: 5 }
    const { html } = buildEmail([ep], 'a@b.com', 'tok')
    expect(html).toContain('New episode S2E5 airs Feb 1')
    expect(html).toContain('/tv/1')
  })
})
