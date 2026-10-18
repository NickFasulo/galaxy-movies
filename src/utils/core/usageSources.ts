import { getRedis } from './redis'
import { getCostEstimate, getUsageStats } from '../ai/aiUsage'
import { isPlusActive, parseBillingRecord } from '../billing/billing'
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
} from '../alerts/waitlistStore'

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

const REDIS_ENV = ['UPSTASH_REDIS_KV_REST_API_URL', 'UPSTASH_REDIS_KV_REST_API_TOKEN']
const UPSTASH_LINK = 'https://console.upstash.com'

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

async function fetchUpstashStats(): Promise<UpstashStats> {
  const auth = `Basic ${btoa(`${process.env.UPSTASH_EMAIL}:${process.env.UPSTASH_API_KEY}`)}`
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
  return (await resp.json()) as UpstashStats
}

async function upstashPanel(): Promise<UsagePanel> {
  const link = UPSTASH_LINK
  if (!process.env.UPSTASH_EMAIL || !process.env.UPSTASH_API_KEY)
    return unconfigured('Upstash Redis', ['UPSTASH_EMAIL', 'UPSTASH_API_KEY'], link)

  const stats = await fetchUpstashStats()

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

const OPENAI_BASE = 'https://api.openai.com/v1/organization'

async function openaiFetchAll<T>(
  adminKey: string,
  path: string,
  params: Record<string, string | number>
): Promise<OpenAiBucket<T>[]> {
  const out: OpenAiBucket<T>[] = []
  let page: string | null = null
  do {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
    if (page) qs.set('page', page)
    const resp: Response = await fetch(`${OPENAI_BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${adminKey}` } })
    if (!resp.ok) throw new Error(`${path} → HTTP ${resp.status}`)
    const body = (await resp.json()) as { data?: OpenAiBucket<T>[]; next_page?: string | null }
    out.push(...(body.data || []))
    page = body.next_page || null
  } while (page)
  return out
}

type CostBucket = OpenAiBucket<{ amount?: { value?: number | string } }>

async function openaiPanel(costsPromise: Promise<CostBucket[] | null>): Promise<UsagePanel> {
  const adminKey = process.env.OPENAI_ADMIN_KEY
  const link = 'https://platform.openai.com/usage'
  if (!adminKey) return unconfigured('OpenAI', ['OPENAI_ADMIN_KEY'], link)

  const startTime = Math.floor(Date.now() / 1000) - 30 * 86400
  const todayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)

  const [costBuckets, usageBuckets] = await Promise.all([
    costsPromise.then((b) => b ?? []),
    openaiFetchAll<{ model?: string; num_model_requests?: number; input_tokens?: number; output_tokens?: number }>(adminKey, '/usage/completions', {
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
  current_period_start?: string
}

const polarApiBase = () => (process.env.POLAR_API_BASE || 'https://api.polar.sh').replace(/\/$/, '')

async function fetchPolarSubs(): Promise<{ subs: PolarSub[]; total: number }> {
  const token = process.env.POLAR_USAGE_TOKEN || process.env.POLAR_ACCESS_TOKEN
  const resp = await fetch(`${polarApiBase()}/v1/subscriptions/?limit=100`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) throw new Error(`subscriptions → HTTP ${resp.status}`)
  const body = (await resp.json()) as { items?: PolarSub[]; pagination?: { total_count?: number } }
  return { subs: body.items || [], total: body.pagination?.total_count ?? (body.items || []).length }
}

async function polarPanel(): Promise<UsagePanel> {
  const link = 'https://polar.sh/dashboard'
  if (!(process.env.POLAR_USAGE_TOKEN || process.env.POLAR_ACCESS_TOKEN))
    return unconfigured('Polar', ['POLAR_USAGE_TOKEN'], link)

  const { subs, total } = await fetchPolarSubs()

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
      { label: 'Subscriptions', value: fmt(total), hint: statusLine || undefined },
      { label: 'Active / trialing', value: fmt(active.length) },
      { label: 'Est. MRR', value: `$${(mrrCents / 100).toFixed(2)}` }
    ]
  }
}

const parseFixedMonthly = (raw?: string): [string, number][] | null => {
  if (!raw) return []
  try {
    return Object.entries(JSON.parse(raw) as Record<string, number>)
      .filter((e): e is [string, number] => typeof e[1] === 'number')
      .sort((a, b) => b[1] - a[1])
  } catch {
    return null
  }
}

async function fetchTakeadsRevenue(monthStart: Date): Promise<{ revenue: number; actions: number; currency: string } | null> {
  const key = process.env.TAKEADS_STATS_KEY
  if (!key) return null
  const resp = await fetch(
    `https://api.takeads.com/v3/api/stats/action?createdAtFrom=${encodeURIComponent(monthStart.toISOString())}`,
    { headers: { Authorization: `Bearer ${key}` } }
  )
  if (!resp.ok) throw new Error(`takeads actions → HTTP ${resp.status}`)
  const body = (await resp.json()) as {
    data?: { status?: string; publisherRevenue?: number; currencyCode?: string }[]
  }
  const items = (body.data || []).filter((a) => a.status !== 'CANCELED')
  return {
    revenue: items.reduce((s, a) => s + (a.publisherRevenue || 0), 0),
    actions: items.length,
    currency: items.find((a) => a.currencyCode)?.currencyCode || 'USD'
  }
}

async function financePanel(costsPromise: Promise<CostBucket[] | null>): Promise<UsagePanel> {
  const link = 'https://polar.sh/dashboard'
  const hasPolar = Boolean(process.env.POLAR_USAGE_TOKEN || process.env.POLAR_ACCESS_TOKEN)
  const hasOpenAi = Boolean(process.env.OPENAI_ADMIN_KEY)
  const hasUpstash = Boolean(process.env.UPSTASH_EMAIL && process.env.UPSTASH_API_KEY)
  const hasTakeads = Boolean(process.env.TAKEADS_STATS_KEY)
  const fixedIncome = parseFixedMonthly(process.env.FINANCE_FIXED_INCOME)
  const fixedExpenses = parseFixedMonthly(process.env.FINANCE_FIXED_EXPENSES)
  if (!hasPolar && !hasOpenAi && !hasUpstash && !hasTakeads && !fixedIncome?.length && !fixedExpenses?.length) {
    return unconfigured('Finance', ['POLAR_USAGE_TOKEN', 'OPENAI_ADMIN_KEY', 'UPSTASH_EMAIL', 'UPSTASH_API_KEY'], link)
  }

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthStartSec = Math.floor(monthStart.getTime() / 1000)
  const [polar, costBuckets, upstash, takeads] = await Promise.all([
    hasPolar ? fetchPolarSubs() : null,
    hasOpenAi ? costsPromise : null,
    hasUpstash ? fetchUpstashStats() : null,
    hasTakeads ? fetchTakeadsRevenue(monthStart) : null
  ])
  const aiSpend = costBuckets
    ?.filter((b) => b.start_time >= monthStartSec)
    .reduce((t, b) => t + (b.results || []).reduce((s, r) => s + Number(r.amount?.value || 0), 0), 0)

  const money = (v: number, cur = 'USD') => (cur === 'USD' ? `$${v.toFixed(2)}` : `${cur} ${v.toFixed(2)}`)
  const detail: UsageMetric[] = []
  const incomeParts: string[] = []
  const expenseParts: string[] = []
  let income = 0
  let expenses = 0
  let hasIncome = false

  if (polar) {
    const yearlyId = process.env.POLAR_PRODUCT_YEARLY
    const active = polar.subs.filter((s) => s.status === 'active' || s.status === 'trialing')
    const mrr =
      active.reduce(
        (sum, s) => sum + (s.amount ?? 0) / (s.recurring_interval === 'year' || (yearlyId && s.product_id === yearlyId) ? 12 : 1),
        0
      ) / 100
    const billed = polar.subs.filter(
      (s) => (s.status === 'active' || s.status === 'canceled') && s.current_period_start && new Date(s.current_period_start) >= monthStart
    )
    const billedTotal = billed.reduce((sum, s) => sum + (s.amount ?? 0), 0) / 100
    income += billedTotal
    hasIncome = true
    incomeParts.push(`Polar $${billedTotal.toFixed(2)}`)
    detail.push({
      label: 'Polar billed',
      value: `$${billedTotal.toFixed(2)}`,
      hint: `${fmt(billed.length)} subs billed · $${mrr.toFixed(2)} MRR`
    })
  }
  if (takeads) {
    income += takeads.revenue
    hasIncome = true
    incomeParts.push(`TakeAds ${money(takeads.revenue, takeads.currency)}`)
    detail.push({ label: 'TakeAds revenue', value: money(takeads.revenue, takeads.currency), hint: `${fmt(takeads.actions)} actions` })
  }
  for (const [name, v] of fixedIncome || []) {
    income += v
    hasIncome = true
    detail.push({ label: name, value: `$${v.toFixed(2)}`, hint: 'fixed income' })
  }
  if (fixedIncome?.length) incomeParts.push(`fixed $${fixedIncome.reduce((s, [, v]) => s + v, 0).toFixed(2)}`)
  if (fixedIncome === null || fixedExpenses === null) {
    detail.push({ label: 'Fixed entries', value: '—', hint: 'invalid FINANCE_FIXED_* JSON — use {"Name": amount}' })
  }

  if (aiSpend != null) {
    expenses += aiSpend
    expenseParts.push(`OpenAI $${aiSpend.toFixed(2)}`)
    detail.push({ label: 'OpenAI', value: `$${aiSpend.toFixed(2)}` })
  }
  if (upstash) {
    const billed = Number(upstash.total_monthly_billing ?? 0)
    expenses += billed
    expenseParts.push(`Upstash $${billed.toFixed(2)}`)
    detail.push({ label: 'Upstash', value: `$${billed.toFixed(2)}` })
  }
  for (const [name, v] of fixedExpenses || []) {
    expenses += v
    detail.push({ label: name, value: `$${v.toFixed(2)}`, hint: 'fixed monthly' })
  }
  if (fixedExpenses?.length) expenseParts.push(`fixed $${fixedExpenses.reduce((s, [, v]) => s + v, 0).toFixed(2)}`)

  const metrics: UsageMetric[] = []
  if (hasIncome) {
    metrics.push({ label: 'Income (this month)', value: `$${income.toFixed(2)}`, hint: incomeParts.join(' · ') })
  }
  metrics.push({
    label: 'Expenses (this month)',
    value: `$${expenses.toFixed(2)}`,
    hint: `${expenseParts.join(' · ') || 'none'}${fixedExpenses?.length ? '' : ' — Cloudflare, Resend, Watchmode untracked'}`
  })
  if (hasIncome) metrics.push({ label: 'Net (this month)', value: `$${(income - expenses).toFixed(2)}` })
  metrics.push(...detail)

  return { name: 'Finance', status: 'ok', link, metrics }
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

async function rateLimitsPanel(): Promise<UsagePanel> {
  const kv = getRedis()
  if (!kv) return unconfigured('Rate limits', REDIS_ENV, UPSTASH_LINK)

  const counts = await kv.mget<(number | null)[]>(...BUDGET_WINDOWS.map((b) => `global_rl:${b.key}:all`))
  return {
    name: 'Rate limits',
    status: 'ok',
    metrics: BUDGET_WINDOWS.map((b, i) => ({
      label: b.label,
      value: fmt(counts[i]),
      hint: `cap ${fmt(b.cap)} / ${b.per}`
    }))
  }
}

async function subscribersPanel(): Promise<UsagePanel> {
  const kv = getRedis()
  if (!kv) return unconfigured('Subscribers', REDIS_ENV, UPSTASH_LINK)

  const [confirmed, prefs, push, trakt, telegram, discord, share, chatHistory, billing, dbsize] =
    await Promise.all([
      kv.hlen(CONFIRMED_KEY),
      kv.hlen(ALERTS_PREFS_KEY),
      kv.hlen(PUSH_KEY),
      kv.hlen(TRAKT_KEY),
      kv.hlen(TELEGRAM_KEY),
      kv.hlen(DISCORD_KEY),
      kv.hlen(SHARE_KEY),
      kv.hlen(CHAT_HISTORY_KEY),
      kv.hgetall<Record<string, unknown>>(BILLING_KEY),
      kv.dbsize()
    ])

  const billingRecords = Object.values(billing || {})
    .map(parseBillingRecord)
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  const plusCount = billingRecords.filter((r) => isPlusActive(r)).length

  return {
    name: 'Subscribers',
    status: 'ok',
    metrics: [
      { label: 'Confirmed subscribers', value: fmt(confirmed) },
      { label: 'Plus (entitled)', value: fmt(plusCount), hint: `${fmt(billingRecords.length)} billing records` },
      { label: 'Synced alert profiles', value: fmt(prefs) },
      {
        label: 'Alert channels',
        value: `${fmt(push)} push · ${fmt(telegram)} tg`,
        hint: `${fmt(discord)} discord · ${fmt(trakt)} trakt · ${fmt(share)} shared lists`
      },
      { label: 'Chat histories stored', value: fmt(chatHistory) },
      { label: 'DB keys', value: fmt(dbsize) }
    ]
  }
}

async function aiUsagePanel(): Promise<UsagePanel> {
  const kv = getRedis()
  if (!kv) return unconfigured('AI usage', REDIS_ENV, UPSTASH_LINK)

  const [stats, costs] = await Promise.all([getUsageStats(), getCostEstimate()])
  const costBreakdown = Object.entries(costs.breakdown || {})
    .sort((a, b) => parseFloat(b[1].slice(1)) - parseFloat(a[1].slice(1)))
    .slice(0, 3)
    .map(([key, detail]) => {
      const m = detail.match(/^(\S+)\s+\((.*)\)$/)
      return { label: `AI ${key}`, value: m?.[1] ?? detail, hint: m?.[2] }
    })

  return {
    name: 'AI usage',
    status: 'ok',
    metrics: [
      { label: 'Chat sessions', value: fmt(stats.totalSessions), hint: `${fmt(stats.totalMessages)} messages${stats.avgRating ? `, ${stats.avgRating}★ avg` : ''}` },
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
  const adminKey = process.env.OPENAI_ADMIN_KEY
  // One /costs fetch feeds both the OpenAI and Finance panels — the org API's
  // rate limit 429s when the two panels race their own copies.
  const costBucketsPromise = adminKey
    ? openaiFetchAll<{ amount?: { value?: number | string } }>(adminKey, '/costs', {
        start_time: Math.floor(Date.now() / 1000) - 30 * 86400,
        bucket_width: '1d',
        group_by: 'line_item',
        limit: 180
      })
    : Promise.resolve(null)

  const panels = await Promise.all([
    guarded('Cloudflare Workers', cloudflarePanel),
    guarded('Upstash Redis', upstashPanel),
    guarded('OpenAI', () => openaiPanel(costBucketsPromise)),
    guarded('Polar', polarPanel),
    guarded('Finance', () => financePanel(costBucketsPromise)),
    guarded('Rate limits', rateLimitsPanel),
    guarded('Subscribers', subscribersPanel),
    guarded('AI usage', aiUsagePanel)
  ])
  return [...panels, linksPanel()]
}
