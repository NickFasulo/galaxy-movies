// One-time Meta token helper for the IG Reels publish flow. Publishing needs
// a *Page* access token (never expires when derived from a long-lived user
// token) plus the IG professional account's user id — this script turns a
// short-lived user token into both.
//
// Prerequisites: a Meta app (developers.facebook.com) with the "Instagram"
// product, an IG professional account linked to a Facebook Page you own, and
// the IG account added under App roles or as app-admin's own asset — dev
// mode can publish to accounts that have a role on the app, no App Review.
//
// 1. Graph API Explorer -> mint a user token on your app with scopes
//    instagram_business_content_publish, pages_show_list, pages_read_engagement
// 2. node scripts/ig-auth.js --app-id ID --app-secret SECRET --short-token TOK
//    (or FB_APP_ID/FB_APP_SECRET in .env.local)
//    -> prints IG_ACCESS_TOKEN + IG_USER_ID for .env.local and repo secrets.
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

const APP_ID = arg('app-id') || envVar('FB_APP_ID')
const APP_SECRET = arg('app-secret') || envVar('FB_APP_SECRET')
const SHORT_TOKEN = arg('short-token') || envVar('FB_SHORT_TOKEN')
const GRAPH = 'https://graph.facebook.com/v21.0'

if (!APP_ID || !APP_SECRET || !SHORT_TOKEN) {
  console.error('Need --app-id --app-secret --short-token (or FB_APP_ID/FB_APP_SECRET/FB_SHORT_TOKEN in .env.local)')
  process.exit(1)
}

const getJson = async (url) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status}: ${j.error?.message || 'request failed'}`)
  return j
}

async function main() {
  const longLived = await getJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}` +
    `&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(SHORT_TOKEN)}`
  )
  if (!longLived.access_token) throw new Error('fb_exchange_token returned no token')

  const pages = await getJson(
    `${GRAPH}/me/accounts?fields=name,access_token,instagram_business_account&access_token=${longLived.access_token}`
  )
  const linked = (pages.data || []).filter((p) => p.instagram_business_account?.id)
  if (!linked.length) throw new Error('no Facebook Page with a linked Instagram business account found')

  for (const page of linked) {
    console.log(`Page: ${page.name} (id ${page.id})`)
    console.log(`  IG_ACCESS_TOKEN=${page.access_token}`)
    console.log(`  IG_USER_ID=${page.instagram_business_account.id}`)
  }
  if (linked.length > 1) console.log('multiple pages linked — use the pair for the page tied to your IG account')
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
