import registry from './listings.json'

export type ListingStatus =
  | 'live'
  | 'in-review'
  | 'queued'
  | 'needs-account'
  | 'needs-payment'
  | 'blocked'
  | 'declined'
  | 'unknown'

export interface Listing {
  id: string
  name: string
  category: string
  status: ListingStatus
  liveUrl?: string
  submitUrl?: string
  submittedAt?: string
  account?: string
  notes?: string
}

export interface ListingCheck {
  id: string
  name: string
  liveUrl: string
  ok: boolean
  blocked?: boolean
  httpStatus?: number
  linksBack?: boolean
  error?: string
}

// Store fronts and directories rate-limit or challenge datacenter UAs — a
// browser UA keeps false negatives down (e.g. Cloudflare-managed stores).
const CHECK_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export function allListings(): Listing[] {
  return registry.listings as Listing[]
}

export function checkableListings(): Listing[] {
  return allListings().filter((l) => l.status === 'live' && !!l.liveUrl)
}

export function unverifiableListings(): Listing[] {
  return allListings().filter((l) => l.status === 'live' && !l.liveUrl)
}

export function backlogListings(): Listing[] {
  return allListings().filter((l) => ['queued', 'needs-account', 'needs-payment', 'blocked', 'unknown'].includes(l.status))
}

export async function checkListing(l: Listing, fetchImpl: typeof fetch = fetch): Promise<ListingCheck> {
  const liveUrl = l.liveUrl as string
  try {
    const resp = await fetchImpl(liveUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': CHECK_UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow'
    })
    if (!resp.ok) {
      // 403/429 is usually the directory's WAF challenging our datacenter
      // fetch — the listing is probably fine but unverifiable from here, so
      // it's reported separately from real failures.
      const blocked = resp.status === 403 || resp.status === 429
      return { id: l.id, name: l.name, liveUrl, ok: false, blocked, httpStatus: resp.status }
    }
    // A 200 that no longer links back means the listing was removed or the
    // page redirected to a generic landing — treat it as a failure worth an
    // email line, not a pass.
    const html = (await resp.text()).slice(0, 500_000)
    const linksBack = html.includes('galaxymovies')
    return { id: l.id, name: l.name, liveUrl, ok: linksBack, httpStatus: resp.status, linksBack }
  } catch (err) {
    return { id: l.id, name: l.name, liveUrl, ok: false, error: String(err).slice(0, 120) }
  }
}

export async function checkListings(fetchImpl: typeof fetch = fetch): Promise<ListingCheck[]> {
  return Promise.all(checkableListings().map((l) => checkListing(l, fetchImpl)))
}
