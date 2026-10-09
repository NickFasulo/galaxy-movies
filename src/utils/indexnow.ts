import { SITE_URL } from './site'

// IndexNow key, also served from public/<key>.txt as the ownership proof
// Bing/Yandex check before accepting pings. Not a secret.
const INDEXNOW_KEY = 'a880828e-8a78-4bee-ae3d-5af30dbe5427'

export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return
  try {
    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls
      })
    })
    if (!resp.ok) console.error(`IndexNow ping failed: ${resp.status}`)
  } catch (err) {
    console.error('IndexNow ping error:', err)
  }
}
