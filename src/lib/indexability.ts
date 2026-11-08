import { getRedis } from './redis'

// Pages that can noindex themselves record the verdict by canonical path; the
// sitemap drops those URLs instead of advertising pages Google then flags as
// "Submitted URL marked noindex" (~50 errors/week, mostly thin /in/ provider
// slices the sitemap's catalog-size gates can't predict). Writes run inside
// GSSP, so they cost one Redis op per SWR revalidation, not per request.
// Missing paths are assumed indexable — the filter only removes a URL after a
// real render proved it thin, and a later render can flip it back.
const NOINDEX_KEY = 'gm:indexability:noindex'

export async function recordIndexability(path: string, isIndexable: boolean): Promise<void> {
  try {
    await getRedis()?.hset(NOINDEX_KEY, { [path]: isIndexable ? 1 : 0 })
  } catch {
    // advisory only — never fail a render over it
  }
}

export async function noindexPaths(): Promise<Set<string>> {
  try {
    const all = (await getRedis()?.hgetall<Record<string, number | string>>(NOINDEX_KEY)) ?? {}
    return new Set(Object.entries(all).filter(([, v]) => String(v) === '0').map(([k]) => k))
  } catch {
    return new Set()
  }
}
