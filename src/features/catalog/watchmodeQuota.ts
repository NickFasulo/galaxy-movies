import { getRedis } from '../../lib/redis'

const QUOTA_KEY = 'wm:quota'
// Long enough to ride out the day; short enough that a reset cycle or a dead
// upstream eventually self-releases the gate without a probe call.
const QUOTA_TTL_SECONDS = 60 * 60 * 6

export interface WatchmodeQuota {
  quota: number
  used: number
  at: number
}

// Watchmode returns X-Account-Quota[-Used] headers on every response — persisting
// the latest pair turns their metering into a circuit breaker that costs zero
// extra credits. Called on success and failure alike; rejected calls report too.
export function recordWatchmodeQuota(resp: Response): void {
  // Number(null) is 0 — a missing "used" header must bail, not record 0.
  const quotaRaw = resp.headers.get('x-account-quota')
  const usedRaw = resp.headers.get('x-account-quota-used')
  if (quotaRaw == null || usedRaw == null) return
  const quota = Number(quotaRaw)
  const used = Number(usedRaw)
  if (!Number.isFinite(quota) || !Number.isFinite(used) || quota <= 0) return
  const kv = getRedis()
  if (!kv) return
  const payload: WatchmodeQuota = { quota, used, at: Date.now() }
  void kv.set(QUOTA_KEY, payload, { ex: QUOTA_TTL_SECONDS }).catch(() => {})
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
