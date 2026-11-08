// One-time OAuth helper for the YouTube upload flow, mirroring
// tiktok-auth.js. Reuses the GOOGLE_OAUTH_* app creds — the same GCP project
// must have YouTube Data API v3 enabled and the youtube.upload scope on the
// consent screen. Consent screens left in "Testing" mode expire refresh
// tokens after 7 days — publish the app (verification not required) so the
// token persists. Videos stay private regardless until the app passes a
// YouTube API audit, so no extra scopes are needed.
//
// 1. console.cloud.google.com -> enable "YouTube Data API v3"; add
//    youtube.upload under OAuth consent screen -> Scopes.
// 2. node scripts/youtube-auth.js url -> open the printed URL, approve,
//    land on the redirect URI ?code=XXX
// 3. node scripts/youtube-auth.js exchange --code XXX
//    -> prints YT_REFRESH_TOKEN; store it alongside the client creds in
//    .env.local and repo secrets (Actions).
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

const CLIENT_ID = arg('client-id') || envVar('YT_CLIENT_ID') || envVar('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = arg('client-secret') || envVar('YT_CLIENT_SECRET') || envVar('GOOGLE_OAUTH_CLIENT_SECRET')
const REDIRECT = arg('redirect-uri') || 'https://www.galaxymovies.app/'
const CODE = arg('code') || ''
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const MODE = process.argv.slice(2).find((m) => m === 'url' || m === 'exchange')

if (MODE === 'url') {
  if (!CLIENT_ID) { console.error('pass --client-id or set GOOGLE_OAUTH_CLIENT_ID in .env.local'); process.exit(1) }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('access_type', 'offline')
  // prompt=consent forces the refresh token to be re-issued — Google only
  // returns one on the first grant otherwise.
  url.searchParams.set('prompt', 'consent')
  console.log(`Open this URL and approve:\n\n${url}\n`)
} else if (MODE === 'exchange') {
  if (!CLIENT_ID || !CLIENT_SECRET || !CODE) {
    console.error('need client creds + --code')
    process.exit(1)
  }
  fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: CODE,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT
    })
  })
    .then(async (r) => {
      const j = await r.json()
      if (!r.ok) throw new Error(`exchange failed: ${r.status} ${j.error_description || j.error}`)
      if (!j.refresh_token) throw new Error('no refresh_token returned — re-run `url` (prompt=consent is required)')
      console.log(`YT_REFRESH_TOKEN=${j.refresh_token}`)
    })
    .catch((err) => { console.error(err.message || err); process.exit(1) })
} else {
  console.log('usage: node scripts/youtube-auth.js url|exchange [--code X] [--redirect-uri U]')
}
