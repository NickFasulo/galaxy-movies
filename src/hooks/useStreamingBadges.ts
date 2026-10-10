import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useUserData } from './useUserData'
import { getProviderIds } from '../utils/tmdb'
import type { MediaType, TitleSummary } from '../types/tmdb'

type BadgeTitle = Pick<TitleSummary, 'id' | 'mediaType'>

// api/watchProviders truncates to MAX_IDS=50 — chunk so long lists (home feed) stay covered.
// Movie and TV ids overlap in TMDB, so chunks are split per media type and
// membership is keyed `type:id`.
const CHUNK = 50

export function useStreamingBadges(movies: BadgeTitle[]): {
  isStreaming: (movie: BadgeTitle) => boolean
  providersFor: (movie: BadgeTitle) => number[]
  myProviderIds: Set<number>
  isReady: boolean
} {
  const { services } = useUserData()

  const myProviderIds = useMemo(() => new Set(
    services.providers.flatMap((key) => getProviderIds(key, services.region))
  ), [services])

  const chunks = useMemo(() => {
    const byType: Record<MediaType, BadgeTitle[]> = { movie: [], tv: [] }
    for (const m of movies) {
      byType[m.mediaType === 'tv' ? 'tv' : 'movie'].push(m)
    }
    const out: { type: MediaType; ids: string }[] = []
    for (const type of ['movie', 'tv'] as const) {
      const list = byType[type]
      for (let i = 0; i < list.length; i += CHUNK) {
        out.push({ type, ids: list.slice(i, i + CHUNK).map((m) => m.id).join(',') })
      }
    }
    return out
  }, [movies])

  const results = useQueries({
    queries: chunks.map(({ type, ids }) => ({
      queryKey: ['watchProviders', type, services.region, ids],
      queryFn: async (): Promise<{ results?: Record<string, number[]> }> => {
        const resp = await fetch(`/api/watchProviders?region=${services.region}&ids=${ids}&type=${type}`)
        if (!resp.ok) throw new Error('Provider lookup failed')
        return resp.json()
      },
      enabled: myProviderIds.size > 0,
      staleTime: 1000 * 60 * 60
    }))
  })

  const providersByKey = new Map<string, number[]>()
  results.forEach((r, i) => {
    const type = chunks[i]?.type || 'movie'
    for (const [id, providerIds] of Object.entries(r.data?.results || {})) {
      providersByKey.set(`${type}:${id}`, providerIds)
    }
  })

  const keyOf = (movie: BadgeTitle) => `${movie.mediaType === 'tv' ? 'tv' : 'movie'}:${movie.id}`

  return {
    myProviderIds,
    isReady: chunks.length > 0 && results.every((r) => r.isSuccess || r.isError),
    providersFor: (movie) => providersByKey.get(keyOf(movie)) || [],
    isStreaming: (movie) => (providersByKey.get(keyOf(movie)) || []).some((pid) => myProviderIds.has(pid))
  }
}
