import { getRedis } from './redis'
import { SITE_URL } from './site'

// IndexNow key, also served from public/<key>.txt as the ownership proof
// Bing/Yandex check before accepting pings. Not a secret.
const INDEXNOW_KEY = 'a880828e-8a78-4bee-ae3d-5af30dbe5427'

export const INDEXNOW_STATUS_KEY = 'gm:indexnow:last'

export interface IndexNowStatus {
  at: string
  urls: number
  ok: boolean
  status?: number
  error?: string
}

export async function pingIndexNow(urls: string[]): Promise<void> {
  const urlList = [...new Set(urls)]
  if (!urlList.length) return
  // Ping results are otherwise invisible (api.indexnow.org is fire-and-forget)
  // — one Redis write per caller run, all callers are daily crons.
  const last: IndexNowStatus = { at: new Date().toISOString(), urls: urlList.length, ok: false }
  try {
    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList
      })
    })
    last.status = resp.status
    last.ok = resp.ok
    if (!resp.ok) console.error(`IndexNow ping failed: ${resp.status}`)
  } catch (err) {
    last.error = err instanceof Error ? err.message : String(err)
    console.error('IndexNow ping error:', err)
  }
  try {
    await getRedis()?.set(INDEXNOW_STATUS_KEY, last)
  } catch {
    // status is advisory — never fail the cron over it
  }
}
