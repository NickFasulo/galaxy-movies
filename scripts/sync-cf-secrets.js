/**
 * Converts .env.local into the JSON format `wrangler secret bulk` expects,
 * dropping values that are build-time-only (NEXT_PUBLIC_* is inlined by
 * OpenNext anyway) or empty. Writes .secrets.json — gitignored, delete-able.
 *
 * Usage: node scripts/sync-cf-secrets.js && npx wrangler secret bulk .secrets.json
 */
const fs = require('fs')
const path = require('path')

const out = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (!m) continue
  const [, key, value] = m
  if (!value || key.startsWith('NEXT_PUBLIC_')) continue
  out[key] = value
}

fs.writeFileSync(path.join(__dirname, '..', '.secrets.json'), JSON.stringify(out, null, 2))
console.log(`wrote .secrets.json with ${Object.keys(out).length} secrets — run: npx wrangler secret bulk .secrets.json`)
