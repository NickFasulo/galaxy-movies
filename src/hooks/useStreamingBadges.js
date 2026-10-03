import { useMemo } from 'react'
import { useQueries } from 'react-query'
import { useUserData } from './useUserData'
import { getProviderId } from '../utils/tmdb'

// api/watchProviders truncates to MAX_IDS=50 — chunk so long lists (home feed) stay covered.
const CHUNK = 50

export function useStreamingBadges(movies) {
  const { services } = useUserData()

  const myProviderIds = useMemo(() => new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter(Boolean)
  ), [services])

  const chunks = useMemo(() => {
    const out = []
    for (let i = 0; i < movies.length; i += CHUNK) {
      out.push(movies.slice(i, i + CHUNK).map((m) => m.id).join(','))
    }
    return out
  }, [movies])

  const results = useQueries(
    chunks.map((ids) => ({
      queryKey: ['watchProviders', services.region, ids],
      queryFn: async () => {
        const resp = await fetch(`/api/watchProviders?region=${services.region}&ids=${ids}`)
        if (!resp.ok) throw new Error('Provider lookup failed')
        return resp.json()
      },
      enabled: myProviderIds.size > 0,
      staleTime: 1000 * 60 * 60
    }))
  )

  const streamingIds = new Set()
  for (const r of results) {
    for (const [id, providerIds] of Object.entries(r.data?.results || {})) {
      if (providerIds.some((pid) => myProviderIds.has(pid))) streamingIds.add(Number(id))
    }
  }

  return (movie) => streamingIds.has(movie.id)
}
