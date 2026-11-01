import { getRedis } from '../../lib/redis'

const QUOTA_KEY = 'wm:quota'
// Long enough to ride out the day; short enough that a reset cycle or a dead
// upstream eventually self-releases the gate without a probe call.
const QUOTA_TTL_SECONDS = 60 * 60 * 6

const LAST_STATUS_KEY = 'wm:last-status'

export interface WatchmodeQuota {
  quota: number
  used: number
  at: number
}

export interface WatchmodeLastStatus {
  status: number
  path: string
  at: number
}

// Watchmode returns X-Account-Quota[-Used] headers on every response — persisting
// the latest pair turns their metering into a circuit breaker that costs zero
// extra credits. Every response also records its status: rejected calls may not
// carry quota headers, and this is the only signal when the upstream goes dark.
export function recordWatchmodeResponse(resp: Response): void {
  const kv = getRedis()
  if (!kv) return
  let path = ''
  try {
    path = new URL(resp.url).pathname
  } catch {}
  const status: WatchmodeLastStatus = { status: resp.status, path, at: Date.now() }
  const writes: Promise<unknown>[] = [kv.set(LAST_STATUS_KEY, status, { ex: QUOTA_TTL_SECONDS })]
  // Number(null) is 0 — a missing "used" header must bail, not record 0.
  const quotaRaw = resp.headers.get('x-account-quota')
  const usedRaw = resp.headers.get('x-account-quota-used')
  if (quotaRaw != null && usedRaw != null) {
    const quota = Number(quotaRaw)
    const used = Number(usedRaw)
    if (Number.isFinite(quota) && Number.isFinite(used) && quota > 0) {
      const payload: WatchmodeQuota = { quota, used, at: Date.now() }
      writes.push(kv.set(QUOTA_KEY, payload, { ex: QUOTA_TTL_SECONDS }))
    }
  }
  void Promise.all(writes).catch(() => {})
}

export async function getWatchmodeLastStatus(): Promise<WatchmodeLastStatus | null> {
  const kv = getRedis()
  if (!kv) return null
  try {
    const s = await kv.get<WatchmodeLastStatus>(LAST_STATUS_KEY)
    return s && s.status ? s : null
  } catch {
    return null
  }
}

export async function getWatchmodeQuota(): Promise<WatchmodeQuota | null> {
  const kv = getRedis()
  if (!kv) return null
  try {
    const q = await kv.get<WatchmodeQuota>(QUOTA_KEY)
    return q && q.quota ? q : null
  } catch {
    return null
  }
}

// Fail-open when nothing has been recorded — absence of data shouldn't stop work.
export async function watchmodeQuotaExceeded(threshold = 0.9): Promise<boolean> {
  const q = await getWatchmodeQuota()
  return Boolean(q && q.used >= q.quota * threshold)
}
