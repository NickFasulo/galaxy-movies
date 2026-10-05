import { useQuery } from 'react-query'

export function usePrices({ tmdbId, mediaType = 'movie', title, year, region = 'US' }) {
  return useQuery(
    ['prices', mediaType, region, String(tmdbId)],
    async () => {
      const params = new URLSearchParams({ id: String(tmdbId), type: mediaType, region })
      if (title) params.set('title', title)
      if (year) params.set('year', String(year))
      const resp = await fetch(`/api/prices?${params.toString()}`)
      if (!resp.ok) throw new Error('Price lookup failed')
      return resp.json()
    },
    {
      enabled: Boolean(tmdbId) && Boolean(title),
      staleTime: 1000 * 60 * 60,
      retry: 1
    }
  )
}
