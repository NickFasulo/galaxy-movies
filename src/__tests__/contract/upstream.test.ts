import { describe, expect, it } from 'vitest'
import { fetchDiscoverMovies, fetchDiscoverTv, getProviderIds, PROVIDER_NAME_MATCH } from '../../utils/catalog/tmdb'
import { getSourceIdMap } from '../../utils/catalog/streamingChanges'

// Live upstream contract checks, run weekly by contract.yml with real keys to
// catch TMDB/Watchmode response-shape drift before it breaks the crons.
// Skipped everywhere else: per-push CI stays keyless (zero upstream spend).
const hasTmdbKey = Boolean(process.env.TMDB_API_KEY)
const hasWatchmodeKey = Boolean(process.env.WATCHMODE_API_KEY)

describe.skipIf(!hasTmdbKey)('tmdb contract', () => {
  it('discover/movie returns paginated results for a known provider', async () => {
    const providerId = getProviderIds('netflix', 'US').join('|')
    expect(providerId).not.toBe('')
    const data = await fetchDiscoverMovies({ providerId, region: 'US', page: 1 })
    expect((data.results || []).length).toBeGreaterThan(0)
    const first = data.results![0]
    expect(typeof first.id).toBe('number')
    expect(typeof first.title).toBe('string')
    expect(typeof data.total_pages).toBe('number')
  })

  it('discover/tv returns paginated results for a known provider', async () => {
    const providerId = getProviderIds('netflix', 'US').join('|')
    const data = await fetchDiscoverTv({ providerId, region: 'US', page: 1 })
    expect((data.results || []).length).toBeGreaterThan(0)
    const first = data.results![0]
    expect(typeof first.id).toBe('number')
    expect(typeof first.name).toBe('string')
  })
})

describe.skipIf(!hasWatchmodeKey)('watchmode contract', () => {
  // Strict on purpose: a renamed or dropped source is exactly the drift this
  // test exists to flag — the error lists which provider stopped resolving.
  it('resolves every mapped provider to a Watchmode source id', async () => {
    const map = await getSourceIdMap()
    const missing = Object.keys(PROVIDER_NAME_MATCH).filter((key) => !map[key])
    expect(missing).toEqual([])
    for (const source of Object.values(map)) {
      expect(typeof source.id).toBe('number')
      expect(typeof source.name).toBe('string')
    }
  })
})
