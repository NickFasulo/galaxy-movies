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
  via?: string
  error?: string
}

// IndexNow 429s are a per-source-IP quota — Workers egress from IPs shared
// with thousands of other tenants' pings, so the budget is often burned
// before our one daily POST arrives. Every participating endpoint relays the
// submission to all IndexNow engines and keeps its own per-IP quota, so
// spread the attempts across engines; a second sweep also helps because each
// new connection usually egresses on a different IP. More, smaller posts
// would make 429 likelier — the limiter counts requests, not URLs.
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://searchadvisor.naver.com/indexnow'
]

export async function pingIndexNow(urls: string[], endpoints = ENDPOINTS): Promise<void> {
  const urlList = [...new Set(urls)]
  if (!urlList.length) return
  // Ping results are otherwise invisible (api.indexnow.org is fire-and-forget)
  // — one Redis write per caller run, all callers are daily crons.
  const last: IndexNowStatus = { at: new Date().toISOString(), urls: urlList.length, ok: false }
  const body = JSON.stringify({
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList
  })
  for (let pass = 0; pass < 2 && !last.ok; pass++) {
    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' },
          body
        })
        last.status = resp.status
        last.ok = resp.ok
        delete last.error
        if (resp.ok) {
          last.via = new URL(endpoint).host
          break
        }
        console.error(`IndexNow ping via ${endpoint} failed: ${resp.status}`)
      } catch (err) {
        last.error = err instanceof Error ? err.message : String(err)
        console.error(`IndexNow ping via ${endpoint} error:`, err)
      }
    }
  }
  try {
    await getRedis()?.set(INDEXNOW_STATUS_KEY, last)
  } catch {
    // status is advisory — never fail the cron over it
  }
}
