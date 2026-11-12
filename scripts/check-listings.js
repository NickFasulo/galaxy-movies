#!/usr/bin/env node
// Ad-hoc liveness check for directory listings. src/features/listings/check.ts
// is the same logic for the worker (weekly indexing-report email) — keep the
// fetch behavior in sync.
const { readFileSync } = require('fs')
const { join } = require('path')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const registry = JSON.parse(readFileSync(join(__dirname, '../src/features/listings/listings.json'), 'utf8'))
const listings = registry.listings

async function check(l) {
  try {
    const resp = await fetch(l.liveUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow'
    })
    if (!resp.ok) {
      const blocked = resp.status === 403 || resp.status === 429
      return { l, line: blocked ? `BLOCKED ${resp.status} (WAF)` : `FAIL ${resp.status}`, blocked }
    }
    const html = (await resp.text()).slice(0, 500000)
    return html.includes('galaxymovies')
      ? { l, line: 'ok' }
      : { l, line: 'FAIL 200 but no galaxymovies link — removed or hijacked?' }
  } catch (err) {
    return { l, line: `FAIL ${String(err).slice(0, 100)}` }
  }
}

async function main() {
  const checkable = listings.filter((l) => l.status === 'live' && l.liveUrl)
  const results = await Promise.all(checkable.map(check))
  const pad = Math.max(...results.map((r) => r.l.name.length))
  for (const r of results) console.log(`${r.l.name.padEnd(pad)}  ${r.line}`)

  const unverified = listings.filter((l) => l.status === 'live' && !l.liveUrl)
  if (unverified.length) {
    console.log(`\nUnverified (live, no liveUrl): ${unverified.map((l) => l.name).join(', ')}`)
  }
  const backlog = listings.filter((l) => ['queued', 'needs-account', 'needs-payment', 'blocked', 'unknown'].includes(l.status))
  console.log(`\nBacklog: ${backlog.length} (queued ${backlog.filter((l) => l.status === 'queued').length})`)

  const failures = results.filter((r) => r.line !== 'ok' && !r.blocked)
  process.exit(failures.length ? 1 : 0)
}

main()
