// One-time LinkedIn token helper for the broadcast channel. Exchanges the
// OAuth `code` for an access token (+ refresh token when the app is issued
// one) and resolves the author URN the post endpoint needs.
//
// Prerequisites: a LinkedIn app (developer.linkedin.com) with the "Share on
// LinkedIn" product — self-serve, no review for personal posting. Org-page
// posting needs the Community Management product + Page admin verification.
//
// 1. Open the consent URL (redirect_uri must be registered on the app):
//    https://www.linkedin.com/oauth/v2/authorization?response_type=code
//      &client_id=<client-id>&redirect_uri=<registered>
//      &scope=w_member_social%20openid%20profile
//    (use w_organization_social instead of w_member_social for a Page)
//    -> browser lands on <redirect>?code=XXX
// 2. node scripts/linkedin-auth.js --client-id ID --client-secret SECRET \
//      --code CODE --redirect-uri URI [--org-urn urn:li:organization:NNN]
//    (or LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET in .env.local)
//    -> prints LINKEDIN_ACCESS_TOKEN (+ LINKEDIN_REFRESH_TOKEN if issued)
//       and LINKEDIN_AUTHOR_URN
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

const CLIENT_ID = arg('client-id') || envVar('LINKEDIN_CLIENT_ID')
const CLIENT_SECRET = arg('client-secret') || envVar('LINKEDIN_CLIENT_SECRET')
const CODE = arg('code') || envVar('LINKEDIN_CODE')
const REDIRECT = arg('redirect-uri') || envVar('LINKEDIN_REDIRECT_URI')
const ORG_URN = arg('org-urn') || envVar('LINKEDIN_AUTHOR_URN')

if (!CLIENT_ID || !CLIENT_SECRET || !CODE || !REDIRECT) {
  console.error('Need --client-id --client-secret --code --redirect-uri (or LINKEDIN_* in .env.local)')
  console.error('Get --code from the OAuth consent URL documented at the top of this file.')
  process.exit(1)
}

const postForm = async (url, params) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status}: ${j.error_description || j.error || 'request failed'}`)
  return j
}

async function main() {
  const tokens = await postForm('https://www.linkedin.com/oauth/v2/accessToken', {
    grant_type: 'authorization_code',
    code: CODE,
    redirect_uri: REDIRECT,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  })
  if (!tokens.access_token) throw new Error('code exchange returned no token')

  let urn = ORG_URN
  if (!urn) {
    const r = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.sub) throw new Error(`userinfo failed: ${r.status} — pass --org-urn for page posting`)
    urn = `urn:li:person:${j.sub}`
  }

  console.log(`LINKEDIN_AUTHOR_URN=${urn}`)
  console.log(`LINKEDIN_ACCESS_TOKEN=${tokens.access_token}`)
  if (tokens.refresh_token) console.log(`LINKEDIN_REFRESH_TOKEN=${tokens.refresh_token}`)
  else console.log('(no refresh token issued — re-run this script when the 60d token expires)')
  console.log(`LINKEDIN_CLIENT_ID=${CLIENT_ID}`)
  console.log(`LINKEDIN_CLIENT_SECRET=${CLIENT_SECRET}`)
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
