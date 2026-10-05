// Prints OpenAI organization spend and token usage for the last N days.
// Requires an admin key: OPENAI_ADMIN_KEY=sk-admin-... node scripts/openai-usage.js [days]

const ADMIN_KEY = process.env.OPENAI_ADMIN_KEY
const DAYS = Math.min(Number(process.argv[2]) || 30, 180)
const BASE = 'https://api.openai.com/v1/organization'

if (!ADMIN_KEY) {
  console.error('Set OPENAI_ADMIN_KEY (an admin key from platform.openai.com → Settings → Admin keys)')
  process.exit(1)
}

async function fetchAll(path, params) {
  const out = []
  let page = null
  do {
    const qs = new URLSearchParams({ ...params, ...(page ? { page } : {}) })
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    })
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
    const body = await res.json()
    out.push(...(body.data || []))
    page = body.next_page || null
  } while (page)
  return out
}

const money = (v) => `$${v.toFixed(4)}`

async function main() {
  const startTime = Math.floor(Date.now() / 1000) - DAYS * 86400

  const [costBuckets, usageBuckets] = await Promise.all([
    fetchAll('/costs', { start_time: startTime, bucket_width: '1d', group_by: 'line_item', limit: 180 }),
    fetchAll('/usage/completions', { start_time: startTime, bucket_width: '1d', group_by: 'model', limit: 31 })
  ])

  const byLineItem = {}
  const byDay = {}
  let total = 0
  for (const bucket of costBuckets) {
    const day = new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
    for (const r of bucket.results || []) {
      const v = Number(r.amount?.value || 0)
      total += v
      byLineItem[r.line_item || 'other'] = (byLineItem[r.line_item || 'other'] || 0) + v
      byDay[day] = (byDay[day] || 0) + v
    }
  }

  const byModel = {}
  for (const bucket of usageBuckets) {
    for (const r of bucket.results || []) {
      const m = byModel[r.model || 'unknown'] || (byModel[r.model || 'unknown'] = { requests: 0, input: 0, cached: 0, cacheWrite: 0, uncached: 0, output: 0 })
      m.requests += r.num_model_requests || 0
      m.input += r.input_tokens || 0
      m.cached += r.input_cached_tokens || 0
      m.cacheWrite += r.input_cache_write_tokens || 0
      m.uncached += r.input_uncached_tokens || 0
      m.output += r.output_tokens || 0
    }
  }

  console.log(`\nOpenAI spend — last ${DAYS} days: ${money(total)}\n`)
  console.log('By line item:')
  for (const [k, v] of Object.entries(byLineItem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(40)} ${money(v)}`)
  }
  console.log('\nBy day:')
  for (const [d, v] of Object.entries(byDay).sort()) {
    console.log(`  ${d}  ${money(v)}`)
  }
  console.log('\nTokens by model:')
  for (const [m, s] of Object.entries(byModel).sort((a, b) => b[1].input - a[1].input)) {
    const hitRate = s.input ? `, ${Math.round((100 * s.cached) / s.input)}% cached` : ''
    console.log(`  ${m.padEnd(30)} ${String(s.requests).padStart(6)} reqs  ${s.input.toLocaleString()} in (${s.uncached.toLocaleString()} uncached, ${s.cacheWrite.toLocaleString()} written${hitRate}) / ${s.output.toLocaleString()} out`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
