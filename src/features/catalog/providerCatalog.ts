import { LRUCache } from 'lru-cache'
import { fetchTmdb, getProviderId, streamingProviders } from './tmdb'
import type { WatchProvider } from '../../types/tmdb'

interface WatchProviderCatalogResponse {
  results?: WatchProvider[]
}

// TMDB's per-region provider catalog (~300 entries) changes rarely enough that a
// day-long in-memory memo is safe — and keeps this off Redis on SSR hot paths.
const catalogMemo = new LRUCache<string, WatchProvider[]>({ max: 8, ttl: 1000 * 60 * 60 * 24 })

export async function getProviderCatalog(region: string): Promise<WatchProvider[]> {
  const cached = catalogMemo.get(region)
  if (cached) return cached

  const data = await fetchTmdb<WatchProviderCatalogResponse>('/watch/providers/movie', { watch_region: region })
  const providers = (data.results || [])
    .filter((p) => p.logo_path)
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))

  catalogMemo.set(region, providers)
  return providers
}

// Provider key → TMDB logo_path for rendering service buttons — logo_path is
// the path next/image resolves through the shared TMDB imageLoader.
export async function getProviderLogosByKey(region: string): Promise<Map<string, string>> {
  const catalog = await getProviderCatalog(region)
  const logoById = new Map(catalog.map((p) => [p.provider_id, p.logo_path]))
  const logos = new Map<string, string>()
  for (const key of Object.keys(streamingProviders)) {
    const id = getProviderId(key, region)
    const logo = id != null ? logoById.get(id) : null
    if (logo) logos.set(key, logo)
  }
  return logos
}
