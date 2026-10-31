import type { Page, Route } from '@playwright/test'

export const E2E_EMAIL = 'e2e@example.com'
export const E2E_KEY = 'e2e-sync-key'

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

// The alerts credential is plain localStorage (gm.alerts.v1) — seeding it
// lands the page in the same state as following a confirm/link email. See
// src/features/alerts/alertsSync.ts.
export async function seedAlertsCreds(page: Page, email = E2E_EMAIL, key = E2E_KEY): Promise<void> {
  await page.addInitScript(
    (creds) => window.localStorage.setItem('gm.alerts.v1', JSON.stringify(creds)),
    { email, key }
  )
}

interface PrefWatchlistItem {
  id: number
  mediaType?: 'movie' | 'tv'
  title: string
  poster_path?: string | null
  year?: string | null
}

interface PrefRatingItem extends PrefWatchlistItem {
  rating: number
}

export interface AccountState {
  entitlement: 'free' | 'plus'
  traktConnected: boolean
  shareId: string | null
  discordWebhook: string | null
  telegramConnected: boolean
  // Shape mirrors SyncedPrefs (src/lib/userData.ts) — what GET /api/alerts-prefs returns.
  prefs: {
    watchlist: PrefWatchlistItem[]
    ratings: PrefRatingItem[]
    services: string[]
    region: string
  }
  traktImport: { status: number; body: unknown }
  traktSync: { status: number; body: unknown }
  // Lowercased CSV title → resolved result, mirroring /api/resolve-titles.
  resolvedTitles: Record<string, { id: number; mediaType: 'movie' | 'tv'; title: string; year?: string; poster_path: string | null }>
  // "movie:550" → poster-paths response row.
  posters: Record<string, { title: string; poster_path: string | null }>
  recs: { id: number; mediaType?: 'movie' | 'tv' }[]
  shareUrl: string
  checkoutUrl: string
}

// Stubs every client-callable /api/* endpoint the alerts/Plus UI touches.
// State is read at request time, so tests can mutate `account` between steps
// to simulate server-side changes (e.g. disconnect flips traktConnected).
export async function stubAccountApi(page: Page, state?: Partial<AccountState>): Promise<AccountState> {
  const account: AccountState = {
    entitlement: 'plus',
    traktConnected: true,
    shareId: null,
    discordWebhook: null,
    telegramConnected: false,
    prefs: { watchlist: [], ratings: [], services: [], region: 'US' },
    traktImport: { status: 200, body: { ok: true, imported: { watchlist: 1, ratings: 0 } } },
    traktSync: { status: 200, body: { ok: true, synced: { watchlist: 2, ratings: 1 } } },
    resolvedTitles: {},
    posters: {},
    recs: [],
    shareUrl: '/list/e2eshare',
    checkoutUrl: '/plus?status=success',
    ...state
  }

  await Promise.all([
    // usePlusStatus — billing/status.ts returns perk state alongside the entitlement.
    page.route('**/api/billing/status*', (route) =>
      fulfillJson(route, {
        entitlement: account.entitlement,
        manageable: true,
        traktConnected: account.traktConnected,
        shareId: account.shareId,
        discordWebhook: account.discordWebhook,
        telegramConnected: account.telegramConnected
      })
    ),
    // GET returns {prefs} for fetchSyncedPrefs; POST is alertsSync's own sync
    // (scheduleAlertsSync fires ~4s after any userData edit once creds exist).
    page.route('**/api/alerts-prefs*', (route) =>
      route.request().method() === 'GET'
        ? fulfillJson(route, { prefs: account.prefs })
        : fulfillJson(route, { ok: true })
    ),
    page.route('**/api/trakt/import', (route) => {
      const { status, body } = account.traktImport
      if ((body as { code?: string })?.code === 'not_connected') account.traktConnected = false
      return fulfillJson(route, body, status)
    }),
    page.route('**/api/trakt/sync', (route) => fulfillJson(route, account.traktSync.body, account.traktSync.status)),
    page.route('**/api/trakt/disconnect', (route) => {
      account.traktConnected = false
      return fulfillJson(route, { ok: true })
    }),
    page.route('**/api/share-link', (route) => {
      if (route.request().method() === 'DELETE') {
        account.shareId = null
        return fulfillJson(route, { ok: true })
      }
      account.shareId = 'e2eshare'
      return fulfillJson(route, { ok: true, share: account.shareUrl })
    }),
    page.route('**/api/resolve-titles', (route) => {
      const items = (route.request().postDataJSON() as { items?: { title?: string }[] } | null)?.items || []
      return fulfillJson(route, {
        results: items.map((item) => ({
          title: item.title,
          resolved: account.resolvedTitles[String(item.title).toLowerCase()] ?? null
        }))
      })
    }),
    page.route('**/api/plus-recs*', (route) => fulfillJson(route, { items: account.recs })),
    page.route('**/api/poster-paths', (route) => {
      const items = (route.request().postDataJSON() as { items?: { id: number; mediaType?: string }[] } | null)?.items || []
      return fulfillJson(route, {
        results: items.map((item) => {
          const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie'
          const meta = account.posters[`${mediaType}:${item.id}`]
          return { id: item.id, mediaType, title: meta?.title ?? `Title ${item.id}`, poster_path: meta?.poster_path ?? null }
        })
      })
    }),
    page.route('**/api/billing/checkout', (route) => fulfillJson(route, { url: account.checkoutUrl })),
    // devSyncKey mirrors the real no-RESEND_API_KEY fallback — the form then
    // stores creds via the same setAlertsCredentials path a confirm link uses.
    page.route('**/api/waitlist', (route) => fulfillJson(route, { ok: true, confirmed: true, devSyncKey: E2E_KEY }))
  ])

  return account
}
