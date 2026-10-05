import { LRUCache } from 'lru-cache'

// const TAKEADS_RESOLVE_URL = 'https://api.takeads.com/v1/product/monetize-api/v2/resolve'

// TMDB provider_name substrings → homepage. Amazon is intentionally absent:
// those providers keep the existing Associates search link instead.
const PROVIDER_HOME_PAGES: [string, string][] = [
  ['netflix', 'https://www.netflix.com'],
  ['hulu', 'https://www.hulu.com'],
  ['disney plus', 'https://www.disneyplus.com'],
  ['apple tv', 'https://tv.apple.com'],
  ['paramount plus', 'https://www.paramountplus.com'],
  ['max', 'https://www.max.com'],
  ['peacock', 'https://www.peacocktv.com'],
  ['jiohotstar', 'https://www.hotstar.com'],
  ['hotstar', 'https://www.hotstar.com'],
  ['zee5', 'https://www.zee5.com'],
  ['sonyliv', 'https://www.sonyliv.com'],
  ['crunchyroll', 'https://www.crunchyroll.com'],
  ['fandango', 'https://www.fandangoathome.com'],
  ['vudu', 'https://www.vudu.com'],
  ['microsoft', 'https://www.microsoft.com/store'],
  ['google play', 'https://play.google.com/store/movies'],
  ['youtube', 'https://www.youtube.com'],
  ['spectrum', 'https://watch.spectrum.net'],
  ['amc', 'https://www.amcplus.com']
]

// Resolved per domain, not per movie — cache hits mean the resolve API is only
// called once per provider domain per day. '' caches a miss (lru-cache rejects null values).
const linkCache = new LRUCache<string, string>({ max: 500, ttl: 1000 * 60 * 60 * 24 })

export function getProviderHomePage(providerName = ''): string | null {
  const name = providerName.toLowerCase()
  if (name.includes('amazon')) return null
  const match = PROVIDER_HOME_PAGES.find(([key]) => name.includes(key))
  return match?.[1] || null
}

export async function resolveTakeadsLinks(iris: (string | null | undefined)[] = []): Promise<Record<string, string | null>> {
  const unique = [...new Set(iris)].filter((iri): iri is string => Boolean(iri))
  // Resolve API disabled until the Takeads account is approved (key returns 401).
  // const apiKey = process.env.TAKEADS_PUBLIC_KEY
  // const pending = apiKey ? unique.filter((iri) => !linkCache.has(iri)) : []

  // if (pending.length > 0) {
  //   try {
  //     const response = await fetch(TAKEADS_RESOLVE_URL, {
  //       method: 'PUT',
  //       headers: {
  //         Authorization: `Bearer ${apiKey}`,
  //         'Content-Type': 'application/json'
  //       },
  //       body: JSON.stringify({ iris: pending })
  //     })
  //     if (response.ok) {
  //       const payload: { data?: { iri: string; trackingLink?: string | null }[] } = await response.json()
  //       const resolved = new Map((payload.data || []).map((item) => [item.iri, item.trackingLink || null]))
  //       for (const iri of pending) {
  //         linkCache.set(iri, resolved.get(iri) || '')
  //       }
  //     } else {
  //       console.error(`Takeads resolve failed: ${response.status}`)
  //     }
  //   } catch (err) {
  //     console.error('Takeads resolve error:', err)
  //   }
  // }

  return Object.fromEntries(unique.map((iri) => [iri, linkCache.get(iri) || null]))
}

export async function getProviderAffiliateLinks(providerNames: string[] = []): Promise<Record<string, string | null>> {
  const names = [...new Set(providerNames)].filter(Boolean)
  const resolved = await resolveTakeadsLinks(names.map(getProviderHomePage))
  return Object.fromEntries(
    names.map((name) => {
      const home = getProviderHomePage(name)
      return [name, (home ? resolved[home] : null) || home]
    })
  )
}
