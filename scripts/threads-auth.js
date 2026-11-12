// One-time Threads token helper for the broadcast channel. The two-step
// OAuth flow: send the user through the threads.net consent dialog to get a
// `code`, this script exchanges it for a short-lived token then upgrades to
// the ~60d long-lived token the cron refreshes from Redis (storedToken in
// socialChannels.ts) — the env var is only the seed.
//
// Prerequisites: the Meta app (same one as IG) needs the "Threads API" use
// case added in the dashboard — it brings its own app id/secret.
//
// 1. Open the consent URL (redirect_uri must be registered on the app):
//    https://threads.net/oauth/authorize?client_id=<threads-app-id>
//      &redirect_uri=<registered>&scope=threads_basic,threads_content_publish
//      &response_type=code
//    -> browser lands on <redirect>?code=XXX (strip the trailing #__)
// 2. node scripts/threads-auth.js --app-id ID --app-secret SECRET \
//      --code CODE --redirect-uri URI
//    (or THREADS_APP_ID/THREADS_APP_SECRET/FACEBOOK_APP_* in .env.local)
//    -> prints THREADS_USER_ID + THREADS_ACCESS_TOKEN for .env.local/secrets
const fs = require('fs')
const path = require('path')

const env = {}
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const envVar = (name) => process.env[name] || env[name]

const APP_ID = arg('app-id') || envVar('THREADS_APP_ID') || envVar('FACEBOOK_APP_ID')
const APP_SECRET = arg('app-secret') || envVar('THREADS_APP_SECRET') || envVar('FACEBOOK_APP_SECRET')
const CODE = arg('code') || envVar('THREADS_CODE')
const REDIRECT = arg('redirect-uri') || envVar('THREADS_REDIRECT_URI')
const GRAPH = 'https://graph.threads.net'

if (!APP_ID || !APP_SECRET || !CODE || !REDIRECT) {
  console.error('Need --app-id --app-secret --code --redirect-uri (or THREADS_APP_ID/THREADS_APP_SECRET/THREADS_CODE/THREADS_REDIRECT_URI in .env.local)')
  console.error('Get --code from the OAuth dialog URL documented at the top of this file.')
  process.exit(1)
}

const postForm = async (url, params) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status}: ${j.error?.message || j.error_message || 'request failed'}`)
  return j
}

const getJson = async (url) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status}: ${j.error?.message || j.error_message || 'request failed'}`)
  return j
}

async function main() {
  const short = await postForm(`${GRAPH}/oauth/access_token`, {
    client_id: APP_ID,
    client_secret: APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT,
    code: CODE
  })
  if (!short.access_token) throw new Error('code exchange returned no token')

  const long = await getJson(
    `${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${APP_SECRET}` +
    `&access_token=${encodeURIComponent(short.access_token)}`
  )
  if (!long.access_token) throw new Error('th_exchange_token returned no token')

  const me = await getJson(`${GRAPH}/v1.0/me?fields=id,username&access_token=${encodeURIComponent(long.access_token)}`)

  console.log(`Threads account: @${me.username || '?'} (id ${me.id})`)
  console.log(`THREADS_USER_ID=${me.id}`)
  console.log(`THREADS_ACCESS_TOKEN=${long.access_token}`)
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
