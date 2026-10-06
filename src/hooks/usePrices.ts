import { useQuery } from '@tanstack/react-query'
import type { MediaType } from '../types/tmdb'
import type { PricePayload } from '../utils/prices'

export function usePrices({ tmdbId, mediaType = 'movie', title, year, region = 'US' }: {
  tmdbId: number | string | null | undefined
  mediaType?: MediaType
  title?: string | null
  year?: string | number | null
  region?: string
}) {
  return useQuery<PricePayload>({
    queryKey: ['prices', mediaType, region, String(tmdbId)],
    queryFn: async () => {
      const params = new URLSearchParams({ id: String(tmdbId), type: mediaType, region })
      if (title) params.set('title', title)
      if (year) params.set('year', String(year))
      const resp = await fetch(`/api/prices?${params.toString()}`)
      if (!resp.ok) throw new Error('Price lookup failed')
      return resp.json()
    },
    enabled: Boolean(tmdbId) && Boolean(title),
    staleTime: 1000 * 60 * 60,
    retry: 1
  })
}
