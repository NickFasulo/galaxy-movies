import { describe, expect, it, vi } from 'vitest'
import { estimateDigitalWindow, describeEstimate } from './streamingEstimate'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('./tmdb', () => ({ fetchTmdb: vi.fn() }))

const TODAY = '2026-11-12'

const usRelease = (type: number, date: string) => ({
  iso_3166_1: 'US',
  release_dates: [{ type, release_date: `${date}T00:00:00.000Z` }]
})
const releaseDates = (...entries: ReturnType<typeof usRelease>[]) => ({ results: entries })
const company = (name: string) => ({ id: 1, name, logo_path: null, origin_country: 'US' })

describe('estimateDigitalWindow', () => {
  it('prefers a confirmed US digital date over any estimate', () => {
    const estimate = estimateDigitalWindow({
      releaseDates: releaseDates(usRelease(3, '2026-11-01'), usRelease(4, '2026-12-05')),
      companies: [company('Universal Pictures')],
      primaryDate: '2026-11-01',
      today: TODAY
    })
    expect(estimate).toMatchObject({ digitalDate: '2026-12-05', anchor: '2026-11-01', low: null, high: null })
  })

  it('estimates from the theatrical anchor plus the matched studio lag', () => {
    const estimate = estimateDigitalWindow({
      releaseDates: releaseDates(usRelease(3, '2026-11-01')),
      companies: [company('Universal Pictures')],
      primaryDate: '2026-11-01',
      today: TODAY
    })
    expect(estimate).toMatchObject({ digitalDate: null, anchor: '2026-11-01', low: '2026-11-18', high: '2026-12-06', studio: 'Universal' })
  })

  it('falls back to the generic window for unmatched studios', () => {
    const estimate = estimateDigitalWindow({
      releaseDates: releaseDates(usRelease(3, '2026-11-01')),
      companies: [company('Some Indie Outfit')],
      primaryDate: '2026-11-01',
      today: TODAY
    })
    expect(estimate).toMatchObject({ low: '2026-12-16', high: '2027-01-30', studio: null })
  })

  it('uses the primary release date when no US theatrical entry exists', () => {
    const estimate = estimateDigitalWindow({
      releaseDates: releaseDates(),
      companies: [company('Sun Pictures')],
      primaryDate: '2026-11-20',
      today: TODAY
    })
    expect(estimate).toMatchObject({ anchor: '2026-11-20', studio: null })
  })

  it('ignores non-US digital dates', () => {
    const estimate = estimateDigitalWindow({
      releaseDates: releaseDates({ iso_3166_1: 'GB', release_dates: [{ type: 4, release_date: '2026-12-05T00:00:00.000Z' }] }),
      companies: [company('Universal Pictures')],
      primaryDate: '2026-11-01',
      today: TODAY
    })
    expect(estimate?.digitalDate).toBeNull()
  })

  it('returns null when the whole window is already in the past', () => {
    expect(estimateDigitalWindow({
      releaseDates: releaseDates(usRelease(3, '2020-06-01')),
      companies: [company('Universal Pictures')],
      primaryDate: '2020-06-01',
      today: TODAY
    })).toBeNull()
  })

  it('returns null with no anchor at all', () => {
    expect(estimateDigitalWindow({ releaseDates: releaseDates(), companies: [], primaryDate: null, today: TODAY })).toBeNull()
  })
})

describe('describeEstimate', () => {
  it('states a confirmed future digital date', () => {
    expect(describeEstimate(
      { digitalDate: '2026-12-05', anchor: '2026-11-01', low: null, high: null, studio: null },
      TODAY
    )).toEqual({ line: 'Digital release Dec 5, 2026.', tail: 'digital release Dec 5, 2026' })
  })

  it('states a past digital date without a forward tail', () => {
    expect(describeEstimate(
      { digitalDate: '2026-11-10', anchor: '2026-09-01', low: null, high: null, studio: null },
      TODAY
    )).toEqual({ line: 'Went digital Nov 10, 2026 — not on a subscription service yet.', tail: null })
  })

  it('names the studio and week span for an in-theaters estimate', () => {
    const { line, tail } = describeEstimate(
      { digitalDate: null, anchor: '2026-11-01', low: '2026-11-18', high: '2026-12-06', studio: 'Universal' },
      TODAY
    )
    expect(line).toBe('In theaters — Universal films typically go digital 2–5 weeks after release, so around December 2026.')
    expect(tail).toBe('expected on digital around December 2026')
  })

  it('leads with the theatrical date when it is still ahead', () => {
    const { line } = describeEstimate(
      { digitalDate: null, anchor: '2026-12-20', low: '2027-01-06', high: '2027-01-24', studio: null },
      TODAY
    )
    expect(line).toBe('In theaters Dec 20, 2026 — most films typically go digital 2–5 weeks after release, so around January 2027.')
  })
})
