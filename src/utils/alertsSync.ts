import type { UserData } from './userData'

const CREDS_KEY = 'gm.alerts.v1'
const LAST_SYNCED_KEY = 'gm.alerts.lastSynced'
const SYNC_DEBOUNCE_MS = 4000

export interface AlertsCredentials {
  email: string
  key: string
}

export function getAlertsCredentials(): AlertsCredentials | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CREDS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAlertsCredentials(email: string, key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CREDS_KEY, JSON.stringify({ email, key }))
  } catch {}
}

function buildSnapshot(data: UserData) {
  return {
    watchlist: data.watchlist.map((item) => ({ id: item.id, mediaType: item.mediaType, title: item.title || '' })),
    services: data.services.providers,
    region: data.services.region
  }
}

async function postPrefs(creds: AlertsCredentials, snapshot: ReturnType<typeof buildSnapshot>): Promise<boolean> {
  const resp = await fetch('/api/alerts-prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, key: creds.key, ...snapshot })
  })
  return resp.ok
}

// Skips the request entirely if nothing changed since the last successful
// sync — every watchlist/rating edit re-renders, so this keeps idle tabs quiet.
export async function syncAlertsNow(data: UserData, creds: AlertsCredentials | null = getAlertsCredentials()): Promise<void> {
  if (!creds) return
  const snapshot = buildSnapshot(data)
  const payload = JSON.stringify(snapshot)

  try {
    if (window.localStorage.getItem(LAST_SYNCED_KEY) === payload) return
  } catch {}

  try {
    const ok = await postPrefs(creds, snapshot)
    if (ok) window.localStorage.setItem(LAST_SYNCED_KEY, payload)
  } catch (err) {
    console.error('Alerts sync failed:', err)
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleAlertsSync(data: UserData): void {
  if (typeof window === 'undefined') return
  const creds = getAlertsCredentials()
  if (!creds) return

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncAlertsNow(data, creds)
  }, SYNC_DEBOUNCE_MS)
}
