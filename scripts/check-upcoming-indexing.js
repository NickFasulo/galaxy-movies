#!/usr/bin/env node
/**
 * Weekly indexing check for upcoming releases (US + IN slices — the same set
 * the streaming-changes cron pings and warms).
 *
 * For each top upcoming title, calls the URL Inspection API and reports index
 * status. Pages not yet indexed get a pre-filled Search Console inspect link —
 * "Request indexing" has no API (the Indexing API only covers JobPosting /
 * BroadcastEvent pages), so the click is manual or browser-agent driven.
 *
 * One-time setup:
 *   1. GCP console → create a service account + JSON key on any project,
 *      enable the "Google Search Console API".
 *   2. Save the key as .secrets-gsc.json in the repo root (gitignored via
 *      .secrets*.json) or point GSC_SERVICE_ACCOUNT at it.
 *   3. Search Console → Settings → Users and permissions → add the SA email
 *      as a user (Restricted is enough).
 *   4. If the property is a URL-prefix property rather than a domain one, set
 *      GSC_SITE_URL=https://www.galaxymovies.app/ in .env.local.
 *
 * Usage: node scripts/check-upcoming-indexing.js [--top N]
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const topN = Number(process.argv.find((a, i) => process.argv[i - 1] === '--top')) || 12

const env = {}
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
    if (m) env[m[1]] = m[2]
  }
} catch {}

const TMDB_KEY = process.env.TMDB_API_KEY || env.TMDB_API_KEY
const SITE_URL = process.env.GSC_SITE_URL || env.GSC_SITE_URL || 'sc-domain:galaxymovies.app'
const SA_PATH = process.env.GSC_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, '.secrets-gsc.json')

if (!TMDB_KEY) { console.error('TMDB_API_KEY missing (.env.local or env)'); process.exit(1) }
if (!fs.existsSync(SA_PATH)) {
  console.error(
    `Service account key not found at ${SA_PATH}\n` +
    `Create one in GCP (enable the Search Console API), save it as .secrets-gsc.json,\n` +
    `and add its client_email as a user on the Search Console property.`
  )
  process.exit(1)
}
const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))

const siteBase = 'https://www.galaxymovies.app'

async function fetchUpcoming(region) {
  const today = new Date().toISOString().split('T')[0]
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    page: '1',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    region,
    'release_date.gte': today,
    'vote_count.gte': '10'
  })
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params}`)
  if (!res.ok) throw new Error(`TMDB ${region} upcoming failed: ${res.status}`)
  return (await res.json()).results || []
}

function signedJwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })}`
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url')
  return `${unsigned}.${sig}`
}

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${signedJwt()}`
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function inspect(token, url) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL, languageCode: 'en-US' })
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || res.status
    throw new Error(`inspect ${url}: ${msg}${res.status === 403 ? ' — is the service account a user on this property, and does GSC_SITE_URL match it?' : ''}`)
  }
  return data.inspectionResult?.indexStatusResult || {}
}

const inspectLink = (url) =>
  `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(SITE_URL)}&id=${encodeURIComponent(url)}`

async function main() {
  const [us, ind] = await Promise.all([fetchUpcoming('US'), fetchUpcoming('IN')])
  const seen = new Set()
  const titles = [...us, ...ind]
    .filter((t) => t?.id && t.overview && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, topN)

  console.log(`Checking ${titles.length} upcoming releases against the Google index…\n`)
  const token = await accessToken()
  const pending = []
  let errors = 0

  for (const t of titles) {
    const url = `${siteBase}/movies/${t.id}`
    try {
      const r = await inspect(token, url)
      const indexed = r.verdict === 'PASS' || r.coverageState === 'Submitted and indexed'
      const state = r.coverageState || r.verdict || 'unknown'
      const crawl = r.lastCrawlTime ? ` · crawled ${r.lastCrawlTime.slice(0, 10)}` : ''
      console.log(`${indexed ? 'INDEXED  ' : 'PENDING  '}${(t.title || '').slice(0, 40).padEnd(40)} ${state}${crawl}`)
      if (!indexed) pending.push(url)
    } catch (err) {
      errors++
      console.log(`ERROR    ${(t.title || '').slice(0, 40).padEnd(40)} ${err.message}`)
    }
  }

  if (errors === titles.length) {
    console.log('\nAll checks errored — fix the cause above before reading results.')
    process.exit(1)
  }
  if (pending.length) {
    console.log(`\n${pending.length} not indexed. "Request indexing" has no API — open each link and click Request Indexing (Google allows ~10-15/day):\n`)
    for (const url of pending) console.log(`  ${inspectLink(url)}`)
  } else {
    console.log('\nAll checked titles are indexed.')
  }
}

main().catch((err) => { console.error(err.message); process.exit(1) })
