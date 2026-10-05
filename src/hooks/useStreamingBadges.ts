import { useMemo } from 'react'
import { useQueries } from 'react-query'
import { useUserData } from './useUserData'
import { getProviderId } from '../utils/tmdb'

// api/watchProviders truncates to MAX_IDS=50 — chunk so long lists (home feed) stay covered.
// Movie and TV ids overlap in TMDB, so chunks are split per media type and
// membership is keyed `type:id`.
const CHUNK = 50

export function useStreamingBadges(movies) {
  const { services } = useUserData()

  const myProviderIds = useMemo(() => new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter(Boolean)
  ), [services])

  const chunks = useMemo(() => {
    const byType = { movie: [], tv: [] }
    for (const m of movies) {
      byType[m.mediaType === 'tv' ? 'tv' : 'movie'].push(m)
    }
    const out = []
    for (const type of ['movie', 'tv']) {
      const list = byType[type]
      for (let i = 0; i < list.length; i += CHUNK) {
        out.push({ type, ids: list.slice(i, i + CHUNK).map((m) => m.id).join(',') })
      }
    }
    return out
  }, [movies])

  const results = useQueries(
    chunks.map(({ type, ids }) => ({
      queryKey: ['watchProviders', type, services.region, ids],
      queryFn: async () => {
        const resp = await fetch(`/api/watchProviders?region=${services.region}&ids=${ids}&type=${type}`)
        if (!resp.ok) throw new Error('Provider lookup failed')
        return resp.json()
      },
      enabled: myProviderIds.size > 0,
      staleTime: 1000 * 60 * 60
    }))
  )

  const streamingIds = new Set()
  results.forEach((r, i) => {
    const type = chunks[i]?.type || 'movie'
    for (const [id, providerIds] of Object.entries(r.data?.results || {})) {
      if (providerIds.some((pid) => myProviderIds.has(pid))) streamingIds.add(`${type}:${id}`)
    }
  })

  return (movie) => streamingIds.has(`${movie.mediaType === 'tv' ? 'tv' : 'movie'}:${movie.id}`)
}
