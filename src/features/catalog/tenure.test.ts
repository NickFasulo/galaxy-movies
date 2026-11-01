import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import {
  getProviderTenureStats,
  getTitleTenure,
  recordProviderMoves,
  MIN_TENURE_SAMPLES,
  type TenureInput,
  type TenureStint
} from './tenure'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()

const input = (tmdbId: number, title = `Title ${tmdbId}`): TenureInput => ({
  tmdbId,
  tmdbType: 'movie',
  title,
  year: 2000
})

const titleHash = () => (fake.map.get('tenure:title:US') || {}) as Record<string, Record<string, TenureStint>>
const providerHash = () => (fake.map.get('tenure:provider:US:netflix') || {}) as Record<string, TenureStint & { t: string }>

beforeEach(() => {
  fake.map.clear()
  vi.clearAllMocks()
  mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
})

describe('recordProviderMoves', () => {
  it('records a first observed arrival', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    expect(providerHash()['movie:1']).toMatchObject({ on: '2026-03-01', left: null, cycles: 1, t: 'Title 1' })
    expect(titleHash()['movie:1'].netflix).toMatchObject({ on: '2026-03-01', left: null, cycles: 1 })
  })

  it('records a departure while keeping the arrival date', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    await recordProviderMoves('US', 'netflix', [], [input(1)], '2026-06-01')
    expect(providerHash()['movie:1']).toMatchObject({ on: '2026-03-01', left: '2026-06-01', cycles: 1 })
  })

  it('uses the scheduled departure date when one is known', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    await recordProviderMoves('US', 'netflix', [], [input(1)], '2026-06-10', new Map([[1, '2026-06-30']]))
    expect(providerHash()['movie:1'].left).toBe('2026-06-30')
  })

  it('a re-arrival after departure bumps cycles and resets the stint', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    await recordProviderMoves('US', 'netflix', [], [input(1)], '2026-06-01')
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-09-01')
    expect(providerHash()['movie:1']).toMatchObject({ on: '2026-09-01', left: null, cycles: 2 })
  })

  it('a departure with no observed arrival records on: null', async () => {
    await recordProviderMoves('US', 'netflix', [], [input(1)], '2026-06-01')
    expect(providerHash()['movie:1']).toMatchObject({ on: null, left: '2026-06-01', cycles: 0 })
  })

  it('keeps per-provider stints independent on the title hash', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    await recordProviderMoves('US', 'hulu', [input(1)], [], '2026-04-01')
    const rec = titleHash()['movie:1']
    expect(rec.netflix.on).toBe('2026-03-01')
    expect(rec.hulu.on).toBe('2026-04-01')
  })

  it('skips titles without a tmdb id', async () => {
    await recordProviderMoves('US', 'netflix', [{ ...input(1), tmdbId: null }], [], '2026-03-01')
    expect(Object.keys(providerHash())).toHaveLength(0)
  })

  it('writes both regions under their own keys', async () => {
    await recordProviderMoves('IN', 'jiohotstar', [input(1)], [], '2026-03-01')
    expect((fake.map.get('tenure:provider:IN:jiohotstar') as Record<string, unknown>)['movie:1']).toBeTruthy()
    expect(titleHash()).toEqual({})
  })
})

describe('getTitleTenure', () => {
  it('returns the per-provider stint map', async () => {
    await recordProviderMoves('US', 'netflix', [input(1)], [], '2026-03-01')
    const map = await getTitleTenure('movie', 1)
    expect(map?.netflix).toMatchObject({ on: '2026-03-01', cycles: 1 })
  })

  it('returns null for untracked titles', async () => {
    expect(await getTitleTenure('movie', 999)).toBeNull()
  })
})

describe('getProviderTenureStats', () => {
  // Distinct provider key per test — stats memoize for an hour by design.
  const seedStints = async (provider: string, stays: [string, string][]) => {
    for (let i = 0; i < stays.length; i++) {
      const [on, left] = stays[i]!
      await recordProviderMoves('US', provider, [input(i + 1)], [], on)
      await recordProviderMoves('US', provider, [], [input(i + 1)], left)
    }
  }

  it('suppresses stats under the sample floor', async () => {
    await seedStints('hulu', [['2025-01-01', '2025-02-01'], ['2025-02-01', '2025-03-01']])
    expect(await getProviderTenureStats('hulu')).toBeNull()
  })

  it('computes median and p75 stay lengths', async () => {
    const stays: [string, string][] = []
    for (let i = 0; i < MIN_TENURE_SAMPLES + 4; i++) {
      stays.push([`2025-01-0${i + 1}`, `2025-0${(i % 3) + 2}-0${i + 1}`])
    }
    await seedStints('netflix', stays)
    const stats = await getProviderTenureStats('netflix')
    expect(stats?.samples).toBe(MIN_TENURE_SAMPLES + 4)
    expect(stats?.medianDays).toBeGreaterThan(0)
    expect(stats?.p75Days).toBeGreaterThanOrEqual(stats!.medianDays)
    expect(stats?.trackedSince).toBe('2025-01-01')
  })
})
