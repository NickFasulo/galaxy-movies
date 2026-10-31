import { SITE_URL } from './site'

// Cloudflare's Cache API exists only on workerd — s-maxage on a Worker response
// does NOT make the edge cache store it, so og renders store themselves here to
// avoid re-running the resvg WASM pipeline per preview-bot hit. Off workerd
// (dev, Vercel standby) every call is a no-op.
interface EdgeCacheStore {
  match(key: string): Promise<Response | undefined>
  put(key: string, res: Response): Promise<void>
}

function store(): EdgeCacheStore | null {
  if (globalThis.navigator?.userAgent !== 'Cloudflare-Workers' || !('caches' in globalThis)) return null
  return (globalThis.caches as unknown as { default: EdgeCacheStore }).default
}

// Canonical host so www/apex/workers.dev hits share one object.
export const edgeCacheKey = (pathAndQuery: string) => `${SITE_URL}${pathAndQuery}`

export async function edgeCacheGet(key: string): Promise<Response | null> {
  try {
    return (await store()?.match(key)) ?? null
  } catch {
    return null
  }
}

// Awaited on the miss path (no ctx.waitUntil in a Pages Router handler) — costs
// ~50ms once per object, versus never populating.
export async function edgeCachePut(key: string, body: ArrayBuffer, contentType: string, ttlSeconds: number): Promise<void> {
  const cache = store()
  if (!cache) return
  try {
    await cache.put(
      key,
      new Response(body, {
        headers: { 'Content-Type': contentType, 'Cache-Control': `public, max-age=${ttlSeconds}` }
      })
    )
  } catch {}
}
