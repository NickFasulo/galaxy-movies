#!/usr/bin/env node
// One-time OAuth for the @galaxymovies brand Trakt account — Trakt has no
// service accounts, so this mints the refresh token the trakt-lists cron
// uses (rotated copies persist in Redis gm:trakt:brand after first run).
//
//   node scripts/trakt-brand-auth.js
//
// Opens the authorize URL, you approve as the brand account, paste the code
// back, and it prints TRAKT_BRAND_REFRESH_TOKEN for .env.local + cf:secrets.
// Env (process env or .env.local): TRAKT_CLIENT_ID. Optional
// TRAKT_REDIRECT_URI overrides the out-of-band paste-back flow.

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

// Mirrors src/features/billing/trakt.ts — scripts are plain JS, can't import TS.
const TRAKT_AUTH = 'https://auth.trakt.tv'
const TRAKT_UA = 'Galaxy Movies (+https://www.galaxymovies.app)'
const REDIRECT_URI = process.env.TRAKT_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'

const env = {}
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const CLIENT_ID = process.env.TRAKT_CLIENT_ID || env.TRAKT_CLIENT_ID
if (!CLIENT_ID) {
  console.error('set TRAKT_CLIENT_ID (env or .env.local)')
  process.exit(1)
}

const verifier = crypto.randomBytes(32).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
const state = crypto.randomBytes(8).toString('hex')

const url = `${TRAKT_AUTH}/oauth/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256'
})}`

console.log('\n1. Open this URL and authorize as the galaxymovies brand account:\n\n' + url)
if (REDIRECT_URI === 'urn:ietf:wg:oauth:2.0:oob') {
  console.log('\n2. Trakt shows a code — paste it here.')
} else {
  console.log('\n2. Browser redirects (and fails to load) — paste the code= param or the whole URL.')
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('\ncode: ', async (answer) => {
  rl.close()
  const code = (answer.match(/code=([a-z0-9]+)/i)?.[1] || answer.trim())
  const resp = await fetch(`${TRAKT_AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': TRAKT_UA },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.refresh_token) {
    console.error(`\ntoken exchange failed (${resp.status}):`, data)
    process.exit(1)
  }
  console.log('\nAdd to .env.local, then run npm run cf:secrets:\n')
  console.log(`TRAKT_BRAND_REFRESH_TOKEN=${data.refresh_token}`)
})
