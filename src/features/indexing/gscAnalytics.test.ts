import { describe, expect, it } from 'vitest'
import { bandDiff, clickMovers, ctrGaps, nearClickPages, newQueries, pageBand, type AnalyticsRow } from './gscAnalytics'

const row = (key: string, clicks: number, impressions: number, position: number, ctr = clicks / impressions): AnalyticsRow => ({
  keys: [key],
  clicks,
  impressions,
  ctr,
  position
})

describe('pageBand', () => {
  it.each([
    [3, 'top10'],
    [10, 'top10'],
    [15, 'top20'],
    [45, 'top50'],
    [80, 'deep']
  ] as const)('position %d is %s', (pos, band) => expect(pageBand(pos)).toBe(band))
})

describe('bandDiff', () => {
  it('flags improvements and declines across band boundaries', () => {
    const { improved, declined } = bandDiff(
      { a: 'top20', b: 'top50' },
      { a: 'deep', b: 'top10' }
    )
    expect(improved).toEqual([{ page: 'a', from: 'deep', to: 'top20' }])
    expect(declined).toEqual([{ page: 'b', from: 'top10', to: 'top50' }])
  })

  it('treats new pages as entering from deep and gone pages as dropping to deep', () => {
    const { improved, declined } = bandDiff({ fresh: 'top10' }, { old: 'top20' })
    expect(improved).toEqual([{ page: 'fresh', from: 'deep', to: 'top10' }])
    expect(declined).toEqual([{ page: 'old', from: 'top20', to: 'deep' }])
  })
})

describe('clickMovers', () => {
  it('ranks week-over-week click deltas', () => {
    const { up, down } = clickMovers(
      [row('/a', 10, 100, 5), row('/b', 1, 50, 30)],
      [row('/a', 2, 90, 8), row('/b', 6, 60, 28)]
    )
    expect(up[0]).toMatchObject({ key: '/a', delta: 8 })
    expect(down[0]).toMatchObject({ key: '/b', delta: -5 })
  })
})

describe('newQueries', () => {
  it('returns queries absent from the previous period above the impression floor', () => {
    const out = newQueries(
      [row('fresh term', 0, 15, 20), row('old term', 2, 10, 10), row('quiet', 0, 1, 40)],
      [row('old term', 1, 8, 12)]
    )
    expect(out.map((r) => r.keys[0])).toEqual(['fresh term'])
  })
})

describe('ctrGaps', () => {
  it('keeps high-impression low-CTR rows sorted by impressions', () => {
    const out = ctrGaps(
      [row('/lowctr', 0, 500, 30, 0), row('/highctr', 10, 400, 5, 0.025), row('/small', 0, 50, 60, 0)],
      100,
      0.01
    )
    expect(out.map((r) => r.keys[0])).toEqual(['/lowctr'])
  })
})

describe('nearClickPages', () => {
  it('keeps pages in the 8-25 position band with real impressions', () => {
    const out = nearClickPages([
      row('/near', 0, 50, 12, 0),
      row('/too high', 5, 100, 5, 0.05),
      row('/too low', 0, 100, 40, 0),
      row('/too quiet', 0, 5, 12, 0)
    ])
    expect(out.map((r) => r.keys[0])).toEqual(['/near'])
  })
})
