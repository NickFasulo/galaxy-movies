#!/usr/bin/env node
/**
 * bot-activity.js — report live rate-limit state from Upstash so crawler
 * traffic is visible without wrangler tail. Scans `global_rl:*` (AI crawler
 * family budgets from lib/crawlerThrottle.ts plus upstream-spend caps) and
 * `*_rl:*` (per-subject buckets from every API route), prints counts
 * sorted descending.
 *
 *   node scripts/bot-activity.js          # top 25 hot buckets
 *   node scripts/bot-activity.js --all    # every bucket
 *   node scripts/bot-activity.js --family # only the global_rl:* budgets
 *
 * Needs UPSTASH_REDIS_KV_REST_API_URL / UPSTASH_REDIS_KV_REST_API_TOKEN from
 * .env.local or env. Counts are current-window tallies, not history — a key
 * disappears when its window expires, so this is a right-now snapshot.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TOP = process.argv.includes('--all') ? Infinity : 25
const FAMILY_ONLY = process.argv.includes('--family')

const env = {}
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
    if (m) env[m[1]] = m[2]
  }
} catch {}

const url = process.env.UPSTASH_REDIS_KV_REST_API_URL || env.UPSTASH_REDIS_KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN || env.UPSTASH_REDIS_KV_REST_API_TOKEN
if (!url || !token) {
  console.error('UPSTASH_REDIS_KV_REST_API_URL/TOKEN missing (.env.local or env)')
  process.exit(1)
}

const { Redis } = require('@upstash/redis')
const redis = new Redis({ url, token })

async function scanAll(match) {
  const keys = []
  let cursor = 0
  do {
    const res = await redis.scan(cursor, { match, count: 500 })
    const [next, batch] = Array.isArray(res) ? res : [res.cursor, res.keys]
    keys.push(...batch)
    cursor = Number(next)
  } while (cursor !== 0)
  return keys
}

async function main() {
  const keys = FAMILY_ONLY
    ? await scanAll('global_rl:*')
    : [...await scanAll('global_rl:*'), ...await scanAll('*_rl:*')]
  if (!keys.length) {
    console.log('No rate-limit keys live right now.')
    return
  }

  const counts = new Map()
  for (let i = 0; i < keys.length; i += 200) {
    const batch = keys.slice(i, i + 200)
    const pipe = redis.pipeline()
    for (const k of batch) pipe.get(k)
    const values = await pipe.exec()
    batch.forEach((k, j) => counts.set(k, Number(values[j]) || 0))
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  for (const [key, count] of sorted.slice(0, TOP)) {
    console.log(`${String(count).padStart(7)}  ${key}`)
  }
  if (sorted.length > TOP) console.log(`… and ${sorted.length - TOP} more (use --all)`)

  const family = sorted.filter(([k]) => k.startsWith('global_rl:'))
  if (family.length) {
    console.log('\nGlobal budgets — ai_* are AI crawler families (600/hr each), the rest are upstream-spend caps:')
    for (const [k, v] of family) console.log(`  ${k.replace('global_rl:', '').padEnd(16)} ${v}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
