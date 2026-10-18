// Per-platform posters for the weekly broadcast. Each channel is env-gated:
// drop the credentials into .env.local (+ cf:secrets) and it activates on the
// next run; absent creds report 'not configured' and cost nothing.
//
// post() returns null on success or a short reason string on failure.

export interface SocialChannel {
  name: string
  // Post character cap — Bluesky 300, X 280, the rest effectively unbounded.
  maxLen: number
  ready(): boolean
  post(text: string, linkUrl: string): Promise<string | null>
}

const postJson = async (url: string, init: RequestInit): Promise<string | null> => {
  try {
    const resp = await fetch(url, init)
    if (resp.ok) return null
    const detail = await resp.text().catch(() => '')
    return `${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
  } catch (err) {
    return err instanceof Error ? err.message : 'fetch failed'
  }
}

// ---------- Bluesky ----------

// Facets are what make the URL clickable — they index UTF-8 bytes, not chars.
function bskyLinkFacets(text: string) {
  const urlRe = /https?:\/\/[^\s]+/g
  const facets = []
  let m
  while ((m = urlRe.exec(text))) {
    const start = new TextEncoder().encode(text.slice(0, m.index)).length
    const end = start + new TextEncoder().encode(m[0]).length
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }]
    })
  }
  return facets
}

const bsky: SocialChannel = {
  name: 'bsky',
  maxLen: 300,
  ready: () => Boolean(process.env.BSKY_HANDLE && process.env.BSKY_APP_PASSWORD),
  async post(text) {
    // Login needs the response body, so it can't go through postJson.
    const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD })
    }).catch(() => null)
    if (!resp?.ok) return `login failed: ${resp?.status ?? 'network'}`
    const data = await resp.json().catch(() => null)
    if (!data?.accessJwt || !data?.did) return 'login returned no session'
    return bskyPost(data.accessJwt, data.did, text)
  }
}

async function bskyPost(jwt: string, did: string, text: string): Promise<string | null> {
  return postJson('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        facets: bskyLinkFacets(text),
        createdAt: new Date().toISOString()
      }
    })
  })
}

// ---------- Discord (own-server channel webhook) ----------

const discord: SocialChannel = {
  name: 'discord',
  maxLen: 2000,
  ready: () => /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(process.env.SOCIAL_DISCORD_WEBHOOK || ''),
  post: (text) =>
    postJson(process.env.SOCIAL_DISCORD_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
}

// ---------- Telegram channel ----------

const telegram: SocialChannel = {
  name: 'telegram',
  maxLen: 4096,
  ready: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL),
  post: (text) =>
    postJson(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHANNEL, text, disable_web_page_preview: false })
    })
}

// ---------- Mastodon ----------

const mastodon: SocialChannel = {
  name: 'mastodon',
  maxLen: 500,
  ready: () => Boolean(process.env.MASTODON_INSTANCE && process.env.MASTODON_TOKEN),
  post: (text) =>
    postJson(`${process.env.MASTODON_INSTANCE!.replace(/\/$/, '')}/api/v1/statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MASTODON_TOKEN}` },
      body: JSON.stringify({ status: text })
    })
}

// ---------- X / Twitter (free tier, OAuth 1.0a user context) ----------

const pctEnc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function xOAuthHeader(method: string, url: string): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: process.env.X_API_KEY!,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.X_ACCESS_TOKEN!,
    oauth_version: '1.0'
  }
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${pctEnc(k)}=${pctEnc(oauth[k])}`)
    .join('&')
  const base = `${method}&${pctEnc(url)}&${pctEnc(paramString)}`
  const signingKey = `${pctEnc(process.env.X_API_SECRET!)}&${pctEnc(process.env.X_ACCESS_TOKEN_SECRET!)}`
  const signature = await hmacSha1Base64(signingKey, base)
  return (
    'OAuth ' +
    [...Object.keys(oauth).sort(), 'oauth_signature']
      .map((k) => `${pctEnc(k)}="${pctEnc(k === 'oauth_signature' ? signature : oauth[k])}"`)
      .join(', ')
  )
}

const x: SocialChannel = {
  name: 'x',
  maxLen: 280,
  ready: () =>
    Boolean(
      process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET
    ),
  async post(text) {
    const url = 'https://api.x.com/2/tweets'
    const auth = await xOAuthHeader('POST', url)
    return postJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ text })
    })
  }
}

// ---------- Reddit (script app → own subreddit link post) ----------

const reddit: SocialChannel = {
  name: 'reddit',
  maxLen: 10000,
  ready: () =>
    Boolean(
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD
    ),
  async post(text, linkUrl) {
    const tokenResp = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`)}`,
        'User-Agent': 'galaxymovies-bot/1.0'
      },
      body: `grant_type=password&username=${encodeURIComponent(process.env.REDDIT_USERNAME!)}&password=${encodeURIComponent(process.env.REDDIT_PASSWORD!)}`
    }).catch(() => null)
    if (!tokenResp?.ok) return `token failed: ${tokenResp?.status ?? 'network'}`
    const token = (await tokenResp.json().catch(() => null))?.access_token
    if (!token) return 'token missing'

    return postJson('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'galaxymovies-bot/1.0'
      },
      body: new URLSearchParams({
        sr: process.env.REDDIT_SUBREDDIT || 'galaxymovies',
        title: text.split('\n')[0].slice(0, 280),
        kind: 'link',
        url: linkUrl,
        resubmit: 'true',
        api_type: 'json'
      }).toString()
    })
  }
}

// ---------- Tumblr ----------

const tumblr: SocialChannel = {
  name: 'tumblr',
  maxLen: 10000,
  ready: () => Boolean(process.env.TUMBLR_BLOG && process.env.TUMBLR_ACCESS_TOKEN),
  post: (text) =>
    postJson(`https://api.tumblr.com/v2/blog/${encodeURIComponent(process.env.TUMBLR_BLOG!)}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TUMBLR_ACCESS_TOKEN}` },
      body: JSON.stringify({
        content: [{ type: 'text', text }],
        tags: ['streaming', 'movies', 'cordcutting']
      })
    })
}

// ---------- Pinterest (pin the branded leaving card) ----------

const pinterest: SocialChannel = {
  name: 'pinterest',
  maxLen: 500,
  ready: () => Boolean(process.env.PINTEREST_BOARD && process.env.PINTEREST_ACCESS_TOKEN),
  post: (text, linkUrl) =>
    postJson('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}` },
      body: JSON.stringify({
        board_id: process.env.PINTEREST_BOARD,
        title: text.split('\n')[0].slice(0, 100),
        description: text.slice(0, 500),
        link: linkUrl,
        media_source: { source_type: 'image_url', url: `${linkUrl.split('/leaving')[0]}/api/og-leaving?provider=netflix` }
      })
    })
}

export const SOCIAL_CHANNELS: SocialChannel[] = [bsky, discord, telegram, mastodon, x, reddit, tumblr, pinterest]
