#!/usr/bin/env node
// Maintains the public Trakt lists under the brand account. api.trakt.tv's
// Cloudflare edge rate-limits datacenter egress (workerd 429s, GH Actions
// 403s), so the Trakt writes run from here on a residential connection — the
// list contents come from /api/cron/trakt-lists on the site.
//
//   node scripts/trakt-lists-sync.js         # sync now
//   node scripts/trakt-lists-sync.js --install   # print launchd setup
//
// Env (.env.local): CRON_SECRET, TRAKT_CLIENT_ID, TRAKT_BRAND_REFRESH_TOKEN
// (bootstrap only — rotated copies persist in Redis gm:trakt:brand),
// UPSTASH_REDIS_KV_REST_API_URL, UPSTASH_REDIS_KV_REST_API_TOKEN.

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
const envVar = (name) => process.env[name] || env[name]

if (process.argv.includes('--install')) {
  const node = process.execPath
  const script = path.join(__dirname, 'trakt-lists-sync.js')
  const workdir = path.join(__dirname, '..')
  console.log(`Save as ~/Library/LaunchAgents/app.galaxymovies.trakt-lists.plist, then:
launchctl load ~/Library/LaunchAgents/app.galaxymovies.trakt-lists.plist

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.galaxymovies.trakt-lists</string>
  <key>ProgramArguments</key>
  <array><string>${node}</string><string>${script}</string></array>
  <key>WorkingDirectory</key><string>${workdir}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/gm-trakt-lists.log</string>
  <key>StandardErrorPath</key><string>/tmp/gm-trakt-lists.log</string>
</dict></plist>`)
  process.exit(0)
}

const SITE = envVar('NEXT_PUBLIC_SITE_URL') || 'https://www.galaxymovies.app'
const CRON = envVar('CRON_SECRET')
const CLIENT_ID = envVar('TRAKT_CLIENT_ID')
const KVU = envVar('UPSTASH_REDIS_KV_REST_API_URL')
const KVT = envVar('UPSTASH_REDIS_KV_REST_API_TOKEN')
for (const [k, v] of Object.entries({ CRON_SECRET: CRON, TRAKT_CLIENT_ID: CLIENT_ID, UPSTASH_REDIS_KV_REST_API_URL: KVU, UPSTASH_REDIS_KV_REST_API_TOKEN: KVT })) {
  if (!v) {
    console.error(`missing ${k} (env or .env.local)`)
    process.exit(1)
  }
}

const TRAKT_AUTH = 'https://auth.trakt.tv'
const TRAKT_API = 'https://api.trakt.tv'
const UA = 'Galaxy Movies (+https://www.galaxymovies.app)'
const BRAND_KEY = 'gm:trakt:brand'
const OOB = 'urn:ietf:wg:oauth:2.0:oob'

const kvGet = async (key, field) => {
  const r = await fetch(`${KVU}/hget/${key}/${field}`, { headers: { Authorization: `Bearer ${KVT}` } })
  const d = await r.json().catch(() => ({}))
  return d.result ? JSON.parse(d.result) : null
}
const kvSet = (key, field, value) =>
  fetch(`${KVU}/hset/${key}/${field}/${encodeURIComponent(JSON.stringify(value))}`, { headers: { Authorization: `Bearer ${KVT}` } })

const trakt = async (accessToken, p, init = {}) => {
  const r = await fetch(`${TRAKT_API}/${p}`, {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'trakt-api-version': '2',
      'trakt-api-key': CLIENT_ID,
      Authorization: `Bearer ${accessToken}`
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    console.error(`Trakt ${init.method || 'GET'} ${p}: ${r.status} ${body.slice(0, 200)}`)
    return null
  }
  return r.json().catch(() => null)
}

async function main() {
  const creds = (await kvGet(BRAND_KEY, 'creds')) || {
    refreshToken: envVar('TRAKT_BRAND_REFRESH_TOKEN'),
    redirectUri: envVar('TRAKT_REDIRECT_URI') || OOB
  }
  if (!creds.refreshToken) {
    console.error('no brand refresh token — run node scripts/trakt-brand-auth.js first')
    process.exit(1)
  }

  const tokenResp = await fetch(`${TRAKT_AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: CLIENT_ID, refresh_token: creds.refreshToken, redirect_uri: creds.redirectUri, grant_type: 'refresh_token' })
  })
  const tokens = await tokenResp.json().catch(() => ({}))
  if (!tokenResp.ok || !tokens.access_token) {
    console.error(`token refresh failed (${tokenResp.status}):`, tokens)
    process.exit(1)
  }
  if (tokens.refresh_token && tokens.refresh_token !== creds.refreshToken) {
    await kvSet(BRAND_KEY, 'creds', { refreshToken: tokens.refresh_token, redirectUri: creds.redirectUri })
  }
  const at = tokens.access_token

  const planResp = await fetch(`${SITE}/api/cron/trakt-lists`, { headers: { Authorization: `Bearer ${CRON}` } })
  const plan = await planResp.json().catch(() => ({}))
  if (!planResp.ok || !plan.lists) {
    console.error(`plan fetch failed (${planResp.status}):`, plan)
    process.exit(1)
  }

  const existing = (await trakt(at, 'users/me/lists')) || []
  const slugs = new Map(existing.filter((l) => l.name && l.ids?.slug).map((l) => [l.name, l.ids.slug]))

  for (const list of plan.lists) {
    let slug = slugs.get(list.name)
    if (!slug) {
      const created = await trakt(at, 'users/me/lists', {
        method: 'POST',
        body: { name: list.name, description: list.description, privacy: 'public' }
      })
      slug = created?.ids?.slug
      if (!slug) {
        console.error(`skipped "${list.name}" — create failed`)
        continue
      }
      slugs.set(list.name, slug)
      console.log(`created "${list.name}"`)
    }

    const entries = (await trakt(at, `users/me/lists/${slug}/items`)) || []
    const movies = entries.filter((e) => e.movie?.ids?.tmdb).map((e) => ({ ids: { tmdb: e.movie.ids.tmdb } }))
    const shows = entries.filter((e) => e.show?.ids?.tmdb).map((e) => ({ ids: { tmdb: e.show.ids.tmdb } }))
    if (movies.length || shows.length) {
      const removed = await trakt(at, `users/me/lists/${slug}/items/remove`, { method: 'POST', body: { movies, shows } })
      if (!removed) {
        console.error(`skipped "${list.name}" — remove failed`)
        continue
      }
    }
    const body = {
      movies: list.movies.map((tmdb) => ({ ids: { tmdb } })),
      shows: list.shows.map((tmdb) => ({ ids: { tmdb } }))
    }
    if (!(await trakt(at, `users/me/lists/${slug}/items`, { method: 'POST', body }))) {
      console.error(`skipped "${list.name}" — add failed`)
      continue
    }
    console.log(`updated "${list.name}" (${body.movies.length} movies, ${body.shows.length} shows)`)
  }
  console.log(`skipped: ${plan.skipped.join(', ') || 'none'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
