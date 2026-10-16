import { getRedis } from './redis'
import { getCostEstimate, getUsageStats } from './aiUsage'
import { isPlusActive, parseBillingRecord } from './billing'
import {
  ALERTS_PREFS_KEY,
  BILLING_KEY,
  CHAT_HISTORY_KEY,
  CONFIRMED_KEY,
  DISCORD_KEY,
  PUSH_KEY,
  SHARE_KEY,
  TELEGRAM_KEY,
  TRAKT_KEY
} from './waitlistStore'

export interface UsageMetric {
  label: string
  value: string
  hint?: string
}

export interface UsagePanel {
  name: string
  status: 'ok' | 'unconfigured' | 'error'
  metrics: UsageMetric[]
  needsEnv?: string[]
  link?: string
  links?: { label: string; url: string }[]
  error?: string
}

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')
const unconfigured = (name: string, needsEnv: string[], link: string): UsagePanel => ({
  name,
  status: 'unconfigured',
  metrics: [],
  needsEnv,
  link
})

const CF_QUERY = `query ($accountTag: string!, $script: string!, $start: string!, $end: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 100, filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
    }
  }
}`

interface CfRow {
  sum?: { requests?: number; errors?: number; subrequests?: number }
  quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number }
}

async function cloudflarePanel(): Promise<UsagePanel> {
  const accountId = process.env.CF_ACCOUNT_ID
  const token = process.env.CF_ANALYTICS_API_TOKEN
  const link = 'https://dash.cloudflare.com/?to=/:account/workers-and-pages'
  if (!accountId || !token) return unconfigured('Cloudflare Workers', ['CF_ACCOUNT_ID', 'CF_ANALYTICS_API_TOKEN'], link)

  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const monthStart = new Date(now.getTime() - 30 * 86400_000)

  const totalsFor = async (start: Date) => {
    const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CF_QUERY,
        variables: {
          accountTag: accountId,
          script: 'galaxy-movies',
          start: start.toISOString(),
          end: now.toISOString()
        }
      })
    })
    const body = await resp.json()
    const gqlError = body?.errors?.[0]?.message
    if (!resp.ok || gqlError) throw new Error(gqlError || `HTTP ${resp.status}`)

    const rows = (body?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []) as CfRow[]
    return rows.reduce(
      (acc, r) => ({
        requests: acc.requests + (r.sum?.requests ?? 0),
        errors: acc.errors + (r.sum?.errors ?? 0),
        subrequests: acc.subrequests + (r.sum?.subrequests ?? 0),
        p50: Math.max(acc.p50, r.quantiles?.cpuTimeP50 ?? 0),
        p99: Math.max(acc.p99, r.quantiles?.cpuTimeP99 ?? 0)
      }),
      { requests: 0, errors: 0, subrequests: 0, p50: 0, p99: 0 }
    )
  }

  const [today, month] = await Promise.all([totalsFor(todayStart), totalsFor(monthStart)])
  const pctOfFree = (today.requests / 100_000) * 100
  const ms = (us: number) => `${(us / 1000).toFixed(2)}ms`

  return {
    name: 'Cloudflare Workers',
    status: 'ok',
    link,
    metrics: [
      { label: 'Requests today', value: fmt(today.requests), hint: `${pctOfFree.toFixed(1)}% of the 100k/day free tier` },
      { label: 'Errors today', value: fmt(today.errors) },
      { label: 'Requests (30d)', value: fmt(month.requests), hint: `${fmt(month.errors)} errors, ${fmt(month.subrequests)} subrequests` },
      { label: 'CPU time today', value: `${ms(today.p50)} p50`, hint: `${ms(today.p99)} p99` }
    ]
  }
}

interface UpstashStats {
  daily_net_commands?: number
  daily_read_requests?: number
  daily_write_requests?: number
  total_monthly_requests?: number
  total_monthly_billing?: number | string
  keyspace?: { x: string; y: number }[]
}

async function upstashPanel(): Promise<UsagePanel> {
  const email = process.env.UPSTASH_EMAIL
  const apiKey = process.env.UPSTASH_API_KEY
  const link = 'https://console.upstash.com'
  if (!email || !apiKey) return unconfigured('Upstash Redis', ['UPSTASH_EMAIL', 'UPSTASH_API_KEY'], link)

  const auth = `Basic ${btoa(`${email}:${apiKey}`)}`
  const headers = { Authorization: auth }

  let dbId = process.env.UPSTASH_DATABASE_ID
  if (!dbId) {
    const resp = await fetch('https://api.upstash.com/v2/redis/databases', { headers })
    if (!resp.ok) throw new Error(`databases list → HTTP ${resp.status}`)
    const host = process.env.UPSTASH_REDIS_KV_REST_API_URL ? new URL(process.env.UPSTASH_REDIS_KV_REST_API_URL).hostname : ''
    const dbs = (await resp.json()) as { database_id: string; endpoint: string }[]
    dbId = dbs.find((d) => d.endpoint === host)?.database_id
    if (!dbId) throw new Error('no database matching UPSTASH_REDIS_KV_REST_API_URL — set UPSTASH_DATABASE_ID')
  }

  const resp = await fetch(`https://api.upstash.com/v2/redis/stats/${dbId}`, { headers })
  if (!resp.ok) throw new Error(`stats → HTTP ${resp.status}`)
  const stats = (await resp.json()) as UpstashStats

  const keyspace = stats.keyspace?.length ? stats.keyspace[stats.keyspace.length - 1].y : null
  const monthlyBilling = Number(stats.total_monthly_billing ?? 0)

  return {
    name: 'Upstash Redis',
    status: 'ok',
    link,
    metrics: [
      {
        label: 'Commands today',
        value: fmt(stats.daily_net_commands),
        hint: `${fmt(stats.daily_read_requests)} reads / ${fmt(stats.daily_write_requests)} writes`
      },
      { label: 'Commands (this month)', value: fmt(stats.total_monthly_requests) },
      { label: 'Billed (this month)', value: `$${monthlyBilling.toFixed(2)}` },
      ...(keyspace != null ? [{ label: 'Keys stored', value: fmt(keyspace) }] : [])
    ]
  }
}

interface OpenAiBucket<T> {
  start_time: number
  results?: T[]
}

async function openaiPanel(): Promise<UsagePanel> {
  const adminKey = process.env.OPENAI_ADMIN_KEY
  const link = 'https://platform.openai.com/usage'
  if (!adminKey) return unconfigured('OpenAI', ['OPENAI_ADMIN_KEY'], link)

  const base = 'https://api.openai.com/v1/organization'
  const fetchAll = async <T>(path: string, params: Record<string, string | number>): Promise<OpenAiBucket<T>[]> => {
    const out: OpenAiBucket<T>[] = []
    let page: string | null = null
    do {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
      if (page) qs.set('page', page)
      const resp: Response = await fetch(`${base}${path}?${qs}`, { headers: { Authorization: `Bearer ${adminKey}` } })
      if (!resp.ok) throw new Error(`${path} → HTTP ${resp.status}`)
      const body = (await resp.json()) as { data?: OpenAiBucket<T>[]; next_page?: string | null }
      out.push(...(body.data || []))
      page = body.next_page || null
    } while (page)
    return out
  }

  const startTime = Math.floor(Date.now() / 1000) - 30 * 86400
  const todayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)

  const [costBuckets, usageBuckets] = await Promise.all([
    fetchAll<{ amount?: { value?: number | string } }>('/costs', {
      start_time: startTime,
      bucket_width: '1d',
      group_by: 'line_item',
      limit: 180
    }),
    fetchAll<{ model?: string; num_model_requests?: number; input_tokens?: number; output_tokens?: number }>('/usage/completions', {
      start_time: startTime,
      bucket_width: '1d',
      group_by: 'model',
      limit: 31
    })
  ])

  let total = 0
  let today = 0
  for (const bucket of costBuckets) {
    for (const r of bucket.results || []) {
      const v = Number(r.amount?.value || 0)
      total += v
      if (bucket.start_time >= todayStart) today += v
    }
  }

  const byModel = new Map<string, { requests: number; input: number; output: number }>()
  for (const bucket of usageBuckets) {
    for (const r of bucket.results || []) {
      const entry = byModel.get(r.model || 'unknown') || { requests: 0, input: 0, output: 0 }
      entry.requests += r.num_model_requests || 0
      entry.input += r.input_tokens || 0
      entry.output += r.output_tokens || 0
      byModel.set(r.model || 'unknown', entry)
    }
  }
  const totalRequests = [...byModel.values()].reduce((s, m) => s + m.requests, 0)
  const topModels = [...byModel.entries()].sort((a, b) => b[1].requests - a[1].requests).slice(0, 3)

  return {
    name: 'OpenAI',
    status: 'ok',
    link,
    metrics: [
      { label: 'Spend (30d)', value: `$${total.toFixed(2)}`, hint: `$${today.toFixed(4)} today` },
      { label: 'Requests (30d)', value: fmt(totalRequests) },
      ...topModels.map(([model, m]) => ({
        label: model,
        value: `${fmt(m.requests)} reqs`,
        hint: `${fmt(m.input)} in / ${fmt(m.output)} out`
      }))
    ]
  }
}

interface PolarSub {
  status?: string
  amount?: number
  recurring_interval?: string
  product_id?: string
}

async function polarPanel(): Promise<UsagePanel> {
  const token = process.env.POLAR_ACCESS_TOKEN
  const link = 'https://polar.sh/dashboard'
  if (!token) return unconfigured('Polar', ['POLAR_ACCESS_TOKEN'], link)

  const apiBase = (process.env.POLAR_API_BASE || 'https://api.polar.sh').replace(/\/$/, '')
  const resp = await fetch(`${apiBase}/v1/subscriptions/?limit=100`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) throw new Error(`subscriptions → HTTP ${resp.status}`)
  const body = (await resp.json()) as { items?: PolarSub[]; pagination?: { total_count?: number } }
  const subs = body.items || []

  const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing')
  const yearlyId = process.env.POLAR_PRODUCT_YEARLY
  const mrrCents = active.reduce((sum, s) => {
    const yearly = s.recurring_interval === 'year' || (yearlyId && s.product_id === yearlyId)
    return sum + (s.amount ?? 0) / (yearly ? 12 : 1)
  }, 0)

  const byStatus = subs.reduce<Record<string, number>>((acc, s) => {
    const status = s.status || 'unknown'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})
  const statusLine = Object.entries(byStatus)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ')

  return {
    name: 'Polar',
    status: 'ok',
    link,
    metrics: [
      { label: 'Subscriptions', value: fmt(body.pagination?.total_count ?? subs.length), hint: statusLine || undefined },
      { label: 'Active / trialing', value: fmt(active.length) },
      { label: 'Est. MRR', value: `$${(mrrCents / 100).toFixed(2)}` }
    ]
  }
}

// Per-bucket caps mirror the checkGlobalBudget call sites — duplicated here
// (rather than exported) so a cap change can't silently shift the display only.
const BUDGET_WINDOWS = [
  { key: 'chat', label: 'Chat calls', cap: 1000, per: 'day' },
  { key: 'watchmode', label: 'Watchmode lookups', cap: Number(process.env.WATCHMODE_DAILY_LOOKUP_BUDGET) || 300, per: 'day' },
  { key: 'waitlist', label: 'Waitlist submissions', cap: 500, per: 'day' },
  { key: 'billing_recover', label: 'Recovery emails', cap: 500, per: 'day' },
  { key: 'ai_review', label: 'AI reviews', cap: 20, per: 'min' },
  { key: 'ai_similar', label: 'AI similar-titles', cap: 20, per: 'min' },
  { key: 'ai_list_intro', label: 'AI list intros', cap: 10, per: 'min' },
  { key: 'wp_lookup', label: 'Uncached provider lookups', cap: 5000, per: 'hour' },
  { key: 'discover', label: 'Discover calls', cap: 2000, per: 'hour' },
  { key: 'price', label: 'Uncached price lookups', cap: 500, per: 'hour' }
]

async function internalPanel(): Promise<UsagePanel> {
  const kv = getRedis()
  if (!kv) return unconfigured('Internal', ['UPSTASH_REDIS_KV_REST_API_URL', 'UPSTASH_REDIS_KV_REST_API_TOKEN'], 'https://console.upstash.com')

  const [counts, confirmed, prefs, push, trakt, telegram, discord, share, chatHistory, billing, dbsize, stats, costs] =
    await Promise.all([
      kv.mget<(number | null)[]>(...BUDGET_WINDOWS.map((b) => `global_rl:${b.key}:all`)),
      kv.hlen(CONFIRMED_KEY),
      kv.hlen(ALERTS_PREFS_KEY),
      kv.hlen(PUSH_KEY),
      kv.hlen(TRAKT_KEY),
      kv.hlen(TELEGRAM_KEY),
      kv.hlen(DISCORD_KEY),
      kv.hlen(SHARE_KEY),
      kv.hlen(CHAT_HISTORY_KEY),
      kv.hgetall<Record<string, unknown>>(BILLING_KEY),
      kv.dbsize(),
      getUsageStats(),
      getCostEstimate()
    ])

  const billingRecords = Object.values(billing || {})
    .map(parseBillingRecord)
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  const plusCount = billingRecords.filter((r) => isPlusActive(r)).length

  const costBreakdown = Object.entries(costs.breakdown || {})
    .sort((a, b) => parseFloat(b[1].slice(1)) - parseFloat(a[1].slice(1)))
    .slice(0, 3)
    .map(([key, detail]) => {
      const m = detail.match(/^(\S+)\s+\((.*)\)$/)
      return { label: `AI ${key}`, value: m?.[1] ?? detail, hint: m?.[2] }
    })

  return {
    name: 'Internal',
    status: 'ok',
    metrics: [
      ...BUDGET_WINDOWS.map((b, i) => ({
        label: b.label,
        value: fmt(counts[i]),
        hint: `cap ${fmt(b.cap)} / ${b.per}`
      })),
      { label: 'Chat sessions', value: fmt(stats.totalSessions), hint: `${fmt(stats.totalMessages)} messages${stats.avgRating ? `, ${stats.avgRating}★ avg` : ''}` },
      { label: 'Confirmed subscribers', value: fmt(confirmed) },
      { label: 'Plus (entitled)', value: fmt(plusCount), hint: `${fmt(billingRecords.length)} billing records` },
      { label: 'Synced alert profiles', value: fmt(prefs) },
      {
        label: 'Alert channels',
        value: `${fmt(push)} push · ${fmt(telegram)} tg`,
        hint: `${fmt(discord)} discord · ${fmt(trakt)} trakt · ${fmt(share)} shared lists`
      },
      { label: 'Chat histories stored', value: fmt(chatHistory) },
      { label: 'DB keys', value: fmt(dbsize) },
      { label: 'Est. AI spend', value: `$${costs.estimatedCost}`, hint: costs.source === 'actual_usage' ? 'from recorded tokens' : 'rough estimate' },
      ...costBreakdown
    ]
  }
}

const linksPanel = (): UsagePanel => ({
  name: 'Dashboards',
  status: 'ok',
  metrics: [],
  links: [
    { label: 'Cloudflare Workers', url: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages' },
    { label: 'Cloudflare Analytics (zone)', url: 'https://dash.cloudflare.com/?to=/:account/:zone/analytics' },
    { label: 'Upstash', url: 'https://console.upstash.com' },
    { label: 'OpenAI usage', url: 'https://platform.openai.com/usage' },
    { label: 'Resend', url: 'https://resend.com/emails' },
    { label: 'Polar', url: 'https://polar.sh/dashboard' },
    { label: 'Watchmode', url: 'https://api.watchmode.com/dashboard' },
    { label: 'Umami', url: 'https://cloud.umami.is' },
    { label: 'Vercel (standby)', url: 'https://vercel.com/dashboard' }
  ]
})

async function guarded(name: string, fn: () => Promise<UsagePanel>): Promise<UsagePanel> {
  try {
    return await fn()
  } catch (err) {
    return { name, status: 'error', metrics: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export async function aggregateUsage(): Promise<UsagePanel[]> {
  const panels = await Promise.all([
    guarded('Cloudflare Workers', cloudflarePanel),
    guarded('Upstash Redis', upstashPanel),
    guarded('OpenAI', openaiPanel),
    guarded('Polar', polarPanel),
    guarded('Internal', internalPanel)
  ])
  return [...panels, linksPanel()]
}
