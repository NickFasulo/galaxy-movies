// One-time OAuth helper for the TikTok posting flow. Default scopes cover
// both drafts (video.upload) and hands-off Direct Post (video.publish) —
// enable them under the app's Content Posting API product in the dev portal.
// Unaudited apps can only Direct Post SELF_ONLY videos until approved.
// --sandbox swaps to the TIKTOK_SANDBOX_* app credentials — required for the
// app-review demo video, which must run against the sandbox environment.
//
// 1. Register an app at developers.tiktok.com, add the Content Posting API
//    product, and add a redirect URI.
// 2. node scripts/tiktok-auth.js url [--sandbox] [--scope S] [--redirect-uri U]
//    -> open the printed URL, approve, land on U?code=XXX
// 3. node scripts/tiktok-auth.js exchange [--sandbox] --code XXX
//    -> prints the refresh token; store TIKTOK_REFRESH_TOKEN (prod) or
//    TIKTOK_SANDBOX_REFRESH_TOKEN (sandbox) alongside the app creds in repo
//    secrets (Actions) and/or .env.local (local runs).
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
const SANDBOX = process.argv.includes('--sandbox')

const CLIENT_KEY = arg('client-key') || envVar(SANDBOX ? 'TIKTOK_SANDBOX_KEY' : 'TIKTOK_CLIENT_KEY')
const CLIENT_SECRET = arg('client-secret') || envVar(SANDBOX ? 'TIKTOK_SANDBOX_SECRET' : 'TIKTOK_CLIENT_SECRET')
const REDIRECT = arg('redirect-uri') || envVar('TIKTOK_REDIRECT_URI') || 'https://www.galaxymovies.app/'
const CODE = arg('code') || ''
const SCOPE = arg('scope') || 'video.upload,video.publish'
const MODE = process.argv.slice(2).find((m) => m === 'url' || m === 'exchange')

if (MODE === 'url') {
  if (!CLIENT_KEY) { console.error('pass --client-key or set the app key in .env.local'); process.exit(1) }
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', CLIENT_KEY)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', REDIRECT)
  url.searchParams.set('state', 'gm-tiktok')
  console.log(`Open this URL and approve:\n\n${url}\n`)
} else if (MODE === 'exchange') {
  if (!CLIENT_KEY || !CLIENT_SECRET || !CODE) {
    console.error('exchange needs --code (app creds from .env.local, or --client-key/--client-secret)')
    process.exit(1)
  }
  fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code: CODE,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT,
    }),
  }).then((r) => r.json()).then((j) => {
    if (j.error) { console.error(`exchange failed: ${j.error_description || j.error}`); process.exit(1) }
    console.log(`granted scopes: ${j.scope}\nopen_id: ${j.open_id}\n`)
    console.log(`refresh_token (valid ~1yr):\n${j.refresh_token}\n`)
    console.log(SANDBOX
      ? 'Store in .env.local as TIKTOK_SANDBOX_REFRESH_TOKEN'
      : 'Store as repo secrets: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REFRESH_TOKEN')
  }).catch((e) => { console.error(e); process.exit(1) })
} else {
  console.error('Usage: node scripts/tiktok-auth.js [--sandbox] url|exchange [--scope S] [--redirect-uri U] [--code C]')
  process.exit(1)
}
