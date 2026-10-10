import { useQuery } from '@tanstack/react-query'
import type { WatchProvider } from '../types/tmdb'

// Logo/name lookup for TMDB watch providers in a region, keyed by provider_id.
// Callers needing a stable reference should memoize off the returned Map.
export function useProviderCatalog(region: string, initialData?: WatchProvider[]) {
  const query = useQuery<{ providers?: WatchProvider[] }, Error, Map<number, WatchProvider>>({
    queryKey: ['providerCatalog', region],
    queryFn: async () => {
      const resp = await fetch(`/api/provider-catalog?region=${region}`)
      if (!resp.ok) throw new Error('Provider catalog fetch failed')
      return resp.json()
    },
    initialData: initialData ? { providers: initialData } : undefined,
    staleTime: 1000 * 60 * 60 * 24,
    select: (data) => new Map((data.providers || []).map((p) => [p.provider_id, p]))
  })
  return query.data
}
