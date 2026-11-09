import { describe, expect, it } from 'vitest'
import { buildRss, escapeXml, providerRssItems } from './rss'
import type { MonthlyChanges, ProviderChanges } from './streamingChanges'

const change: ProviderChanges = {
  source: 'Netflix',
  updatedAt: 1761177600000,
  added: [{ tmdbId: 10, tmdbType: 'movie', title: 'New & <Bold> "Film"', year: 2025 }],
  left: [{ tmdbId: 11, tmdbType: 'tv', title: 'Departed Show', year: 2020 }],
  coming: [{ tmdbId: 12, tmdbType: 'tv', title: 'Coming Show', date: '2026-11-20', season: 2 }],
  leavingSoon: [{ tmdbId: 13, tmdbType: 'movie', title: 'Soon Gone', date: '2026-11-30', season: null }]
}

const monthly: MonthlyChanges = {
  source: 'Netflix',
  month: '2026-11',
  updatedAt: 1761177600000,
  arrived: [{ tmdbId: 14, tmdbType: 'movie', title: 'Arrived Film', date: '2026-11-02', season: null }],
  coming: [],
  departed: [{ tmdbId: 15, tmdbType: 'movie', title: 'Departed Film', year: 2019, date: '2026-11-05' }]
}

describe('providerRssItems', () => {
  it('emits all six kinds with the right categories and verbs', () => {
    const items = providerRssItems('netflix', change, monthly)
    const byKind = (k: string) => items.find((i) => i.category === k)
    expect(byKind('coming')?.title).toBe('Coming Show season 2 comes to Netflix')
    expect(byKind('leaving')?.title).toBe('Soon Gone leaves Netflix')
    expect(byKind('arrived')?.title).toBe('Arrived Film arrived on Netflix')
    expect(byKind('departed')?.title).toBe('Departed Film left Netflix')
    expect(byKind('added')?.title).toBe('New & <Bold> "Film" added to Netflix')
    expect(byKind('left')?.title).toBe('Departed Show left Netflix')
  })

  it('publishes dated items on their date and undated items on the stamp', () => {
    const items = providerRssItems('netflix', change, monthly)
    const coming = items.find((i) => i.category === 'coming')!
    expect(coming.pubDate).toBe(Date.parse('2026-11-20T00:00:00Z'))
    const added = items.find((i) => i.category === 'added')!
    expect(added.pubDate).toBe(change.updatedAt)
  })

  it('dedupes identical events and skips unmatched titles', () => {
    const dup: ProviderChanges = {
      ...change,
      coming: [change.coming[0], change.coming[0]],
      added: [...change.added, { tmdbId: null, tmdbType: 'movie', title: 'Ghost', year: 2025 }]
    }
    const items = providerRssItems('netflix', dup, monthly)
    expect(items.filter((i) => i.category === 'coming')).toHaveLength(1)
    expect(items.every((i) => !i.title.startsWith('Ghost'))).toBe(true)
  })

  it('sorts newest-first', () => {
    const items = providerRssItems('netflix', change, monthly)
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].pubDate).toBeGreaterThanOrEqual(items[i].pubDate)
    }
  })
})

describe('buildRss', () => {
  const items = providerRssItems('netflix', change, monthly)
  const xml = buildRss(items, {
    title: 'Netflix arrivals & departures — Galaxy Movies',
    link: 'https://www.galaxymovies.app/leaving/netflix',
    description: 'Daily diffs.',
    self: 'https://www.galaxymovies.app/api/rss/netflix'
  })

  it('emits a well-formed channel with self link', () => {
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<atom:link href="https://www.galaxymovies.app/api/rss/netflix" rel="self" type="application/rss+xml" />')
    expect(xml).toContain('<title>Netflix arrivals &amp; departures — Galaxy Movies</title>')
  })

  it('escapes XML entities in titles', () => {
    expect(xml).toContain('New &amp; &lt;Bold&gt; &quot;Film&quot; added to Netflix')
    expect(xml).not.toContain('<Bold>')
  })

  it('includes guid, pubDate, category and link per item', () => {
    const item = xml.match(/<item>[\s\S]*?<\/item>/)![0]
    expect(item).toContain('<guid isPermaLink="false">pub:netflix:')
    expect(item).toContain('<pubDate>')
    expect(item).toContain('<category>')
    expect(item).toContain('<link>https://www.galaxymovies.app/movies/')
  })
})

describe('escapeXml', () => {
  it('escapes all five entities', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })
})
