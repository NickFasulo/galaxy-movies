import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildDiscordMessage, buildEmail, loadEpisodeIndex, matchItems, parsePrefs, type AlertPrefs, type MatchedItem } from './watchlistAlerts'
import type { CatalogTitle, ProviderChanges } from '../catalog/streamingChanges'

const fetchTmdb = vi.hoisted(() => vi.fn())
vi.mock('../catalog/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalog/tmdb')>()),
  fetchTmdb
}))

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

  it('matches scheduled departures with the announced date', () => {
    const changes = {
      netflix: providerChanges({
        leavingSoon: [{ tmdbId: 1, tmdbType: 'movie', title: 'Title 1', date: '2026-11-01', season: null }]
      })
    }
    const matches = matchItems(prefs(), changes, new Set(), { leaving: true })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ kind: 'leaving', date: '2026-11-01', notifiedKey: 'leaving:movie:1@netflix' })
  })

  it('the leaving heads-up dedupes the later detected departure', () => {
    const notified = new Set(['leaving:movie:1@netflix'])
    const changes = {
      netflix: providerChanges({
        left: [catalogTitle(1)],
        leavingSoon: [{ tmdbId: 1, tmdbType: 'movie', title: 'Title 1', date: '2026-11-01', season: null }]
      })
    }
    expect(matchItems(prefs(), changes, notified, { leaving: true })).toHaveLength(0)
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

const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

describe('loadEpisodeIndex', () => {
  beforeEach(() => {
    fetchTmdb.mockReset()
    fetchTmdb.mockImplementation(async (path: string) => {
      const id = Number(path.split('/')[2])
      return { next_episode_to_air: { air_date: daysFromNow(3), season_number: 1, episode_number: id % 10 || 1, name: 'Ep' } }
    })
  })

  const tvPrefs = (ids: number[]): AlertPrefs =>
    prefs({ watchlist: ids.map((id) => ({ id, mediaType: 'tv' as const, title: `Show ${id}` })) })

  it('dedupes shows across subscribers — one fetch per unique id', async () => {
    const index = await loadEpisodeIndex([tvPrefs([1, 2]), tvPrefs([2, 3])])
    expect(fetchTmdb).toHaveBeenCalledTimes(3)
    expect([...index.keys()].sort()).toEqual([1, 2, 3])
  })

  it('drops episodes airing in the past or beyond the window', async () => {
    fetchTmdb.mockImplementation(async (path: string) => {
      const id = Number(path.split('/')[2])
      const air = { 1: daysFromNow(-1), 2: daysFromNow(0), 3: daysFromNow(14), 4: daysFromNow(15) }[id]
      return { next_episode_to_air: { air_date: air, season_number: 1, episode_number: 1 } }
    })
    const index = await loadEpisodeIndex([tvPrefs([1, 2, 3, 4])])
    expect([...index.keys()].sort()).toEqual([2, 3])
  })

  it('skips ended shows and malformed air dates silently', async () => {
    fetchTmdb.mockImplementation(async (path: string) => {
      const id = Number(path.split('/')[2])
      if (id === 1) return { next_episode_to_air: null }
      if (id === 2) return {}
      return { next_episode_to_air: { air_date: 'soon', season_number: 1, episode_number: 1 } }
    })
    const index = await loadEpisodeIndex([tvPrefs([1, 2, 3])])
    expect(index.size).toBe(0)
    expect(fetchTmdb).toHaveBeenCalledTimes(3)
  })

  it('caps fetches at 40 and only calls in-set ids when the show list is larger', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => i + 1)
    const index = await loadEpisodeIndex([tvPrefs(ids)])
    expect(fetchTmdb).toHaveBeenCalledTimes(40)
    const fetched = fetchTmdb.mock.calls.map((c) => Number(c[0].split('/')[2]))
    for (const id of fetched) expect(ids).toContain(id)
    expect(index.size).toBe(40)
  })

  it('survives individual fetch failures', async () => {
    fetchTmdb.mockImplementation(async (path: string) => {
      const id = Number(path.split('/')[2])
      if (id === 2) throw new Error('tmdb 500')
      return { next_episode_to_air: { air_date: daysFromNow(2), season_number: 1, episode_number: 1 } }
    })
    const index = await loadEpisodeIndex([tvPrefs([1, 2, 3])])
    expect([...index.keys()].sort()).toEqual([1, 3])
  })
})
