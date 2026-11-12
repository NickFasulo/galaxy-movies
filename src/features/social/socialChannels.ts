// Per-platform posters for the weekly broadcast. Each channel is env-gated:
// drop the credentials into .env.local (+ cf:secrets) and it activates on the
// next run; absent creds report 'not configured' and cost nothing.
//
// post() returns null on success or a short reason string on failure.

import { getRedis } from '../../lib/redis'

export interface SocialChannel {
  name: string
  // Post character cap — Bluesky 300, X 280, the rest effectively unbounded.
  maxLen: number
  // 'markdown' channels (Reddit) get the rich multi-line digest; everything
  // else gets the compact ✅/❌ format tuned for short posts.
  format?: 'markdown'
  ready(): boolean
  post(text: string, linkUrl: string, title?: string): Promise<string | null>
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

// postJson variant for calls whose response body matters (container ids).
const postJsonResult = async (
  url: string,
  init: RequestInit
): Promise<{ json?: { id?: string; error?: { message?: string }; message?: string }; error?: string }> => {
  try {
    const resp = await fetch(url, init)
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      const detail = json?.error?.message || json?.message || ''
      return { error: `${resp.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}` }
    }
    return { json }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' }
  }
}

// Expiring OAuth tokens (Threads/LinkedIn ~60d) can't be refreshed into
// worker secrets — so Redis holds the rotated value and the env var is only
// the seed. Same pattern as traktLists' brand creds.
async function storedToken<T>(key: string, envSeed: T | undefined): Promise<T | undefined> {
  const kv = getRedis()
  const stored = kv ? await kv.hget<T>(key, 'token').catch(() => null) : null
  return stored ?? envSeed
}

const storeToken = (key: string, token: unknown) =>
  getRedis()?.hset(key, { token }).catch(() => undefined)

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

// ---------- Reddit (script app → own subreddit self post) ----------
// Self post, not a link post: the digest body IS the content the sub exists
// for, so the markdown goes in `text` and the site link rides in the footer.
// redditAccessToken/redditSubmit are exported for the community-engagement
// cron (redditEngage.ts) — separate REDDIT_ENGAGE_* creds, separate subs.

const REDDIT_UA = 'galaxymovies-bot/1.0 (by /u/galaxymovies)'

export async function redditAccessToken(
  clientId: string,
  clientSecret: string,
  username: string,
  password: string
): Promise<{ token?: string; error?: string }> {
  const resp = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'User-Agent': REDDIT_UA
    },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  }).catch(() => null)
  if (!resp?.ok) return { error: `token failed: ${resp?.status ?? 'network'}` }
  const token = (await resp.json().catch(() => null))?.access_token
  return token ? { token } : { error: 'token missing' }
}

export async function redditSubmit(
  token: string,
  opts: { sub: string; title: string; text: string }
): Promise<string | null> {
  return postJson('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
      'User-Agent': REDDIT_UA
    },
    body: new URLSearchParams({
      sr: opts.sub,
      title: opts.title.slice(0, 280),
      kind: 'self',
      text: opts.text,
      resubmit: 'true',
      api_type: 'json'
    }).toString()
  })
}

const reddit: SocialChannel = {
  name: 'reddit',
  maxLen: 10000,
  format: 'markdown',
  ready: () =>
    Boolean(
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD
    ),
  async post(text, linkUrl, title) {
    const auth = await redditAccessToken(
      process.env.REDDIT_CLIENT_ID!,
      process.env.REDDIT_CLIENT_SECRET!,
      process.env.REDDIT_USERNAME!,
      process.env.REDDIT_PASSWORD!
    )
    if (!auth.token) return auth.error || 'token missing'
    return redditSubmit(auth.token, {
      sub: process.env.REDDIT_SUBREDDIT || 'galaxymovies',
      title: title || text.split('\n')[0].replace(/:$/, ''),
      text
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

// ---------- Facebook Page ----------
// Direct Graph feed post when FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN exist (the
// token rides in the form body, never the URL, so it can't land in access
// logs). Otherwise POST {message, link} to SOCIAL_FACEBOOK_WEBHOOK — a
// Make/Zapier catch hook whose scenario publishes via its own approved app,
// which is how page posting works without a Meta developer account.

const facebook: SocialChannel = {
  name: 'facebook',
  maxLen: 63206,
  ready: () =>
    Boolean(process.env.SOCIAL_FACEBOOK_WEBHOOK || (process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN)),
  post: (text, linkUrl) => {
    const pageId = process.env.FB_PAGE_ID
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN
    if (pageId && pageToken) {
      return postJson(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: pageToken, message: text, link: linkUrl }).toString()
      })
    }
    return postJson(process.env.SOCIAL_FACEBOOK_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, link: linkUrl })
    })
  }
}

// ---------- Threads (Meta app → brand account) ----------
// Two-step publish: create a TEXT container, then publish it. Long-lived
// tokens last ~60d; the refresh writes the rotated token to Redis (the env
// var only seeds it) so weekly posts keep the token alive indefinitely.

const THREADS_TOKEN_KEY = 'gm:social:threads'

async function rotateThreadsToken(token: string) {
  try {
    const resp = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`
    )
    const json = await resp.json().catch(() => null)
    if (resp.ok && json?.access_token) await storeToken(THREADS_TOKEN_KEY, json.access_token)
  } catch { /* opportunistic — next post retries */ }
}

const threads: SocialChannel = {
  name: 'threads',
  maxLen: 500,
  ready: () => Boolean(process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN),
  async post(text) {
    const token = await storedToken<string>(THREADS_TOKEN_KEY, process.env.THREADS_ACCESS_TOKEN)
    if (!token) return 'no token'
    const uid = process.env.THREADS_USER_ID!

    const create = await postJsonResult(`https://graph.threads.net/v1.0/${uid}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ media_type: 'TEXT', text, access_token: token }).toString()
    })
    if (create.error) return create.error
    if (!create.json?.id) return 'no container id'

    const published = await postJson(`https://graph.threads.net/v1.0/${uid}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: create.json.id, access_token: token }).toString()
    })
    if (published) return published
    await rotateThreadsToken(token)
    return null
  }
}

// ---------- LinkedIn (app → personal profile or org page) ----------
// Same rotation story as Threads: 60d access tokens, refresh via the OAuth
// token endpoint, rotated pair lives in Redis. If the app wasn't issued a
// refresh token, LINKEDIN_REFRESH_TOKEN stays unset and the channel runs on
// the static env token until it dies (re-auth via scripts/linkedin-auth.js).

const LINKEDIN_TOKEN_KEY = 'gm:social:linkedin'
interface LinkedinTokens { accessToken: string; refreshToken?: string }

async function rotateLinkedinToken(tokens: LinkedinTokens) {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env
  if (!tokens.refreshToken || !LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) return
  try {
    const resp = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET
      }).toString()
    })
    const json = await resp.json().catch(() => null)
    if (resp.ok && json?.access_token) {
      await storeToken(LINKEDIN_TOKEN_KEY, {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || tokens.refreshToken
      } satisfies LinkedinTokens)
    }
  } catch { /* opportunistic — next post retries */ }
}

const linkedin: SocialChannel = {
  name: 'linkedin',
  maxLen: 3000,
  ready: () => Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_AUTHOR_URN),
  async post(text) {
    const tokens = await storedToken<LinkedinTokens>(LINKEDIN_TOKEN_KEY, {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN!,
      refreshToken: process.env.LINKEDIN_REFRESH_TOKEN
    })
    if (!tokens?.accessToken) return 'no token'

    const created = await postJsonResult('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        'LinkedIn-Version': '202504',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        author: process.env.LINKEDIN_AUTHOR_URN,
        commentary: text,
        visibility: 'PUBLIC',
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      })
    })
    if (created.error) return created.error
    await rotateLinkedinToken(tokens)
    return null
  }
}

export const SOCIAL_CHANNELS: SocialChannel[] = [
  bsky,
  discord,
  telegram,
  mastodon,
  x,
  reddit,
  tumblr,
  pinterest,
  facebook,
  threads,
  linkedin
]
