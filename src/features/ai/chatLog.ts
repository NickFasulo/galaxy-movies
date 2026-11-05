import type { Redis } from '@upstash/redis'

// Anonymous prompt log for demand mining + response tuning. Entries carry no
// email/IP — the Plus flag is a boolean, not an identity.
export const CHAT_LOG_KEY = 'chat:log'
const CHAT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CHAT_LOG_MAX_ENTRIES = 2000

export interface ChatLogEntry {
  ts: number
  q: string
  a?: string
  region: string
  plus: boolean
  turns: number
  intents: string[]
  grounded?: string[]
  titles?: string[]
  cached?: boolean
}

// zset scored by ts: every write also prunes past the 30d window and trims to
// the newest entries, so retention stays bounded without a cron. 3 billed
// commands per logged request — bounded by the global daily chat budget.
export async function logChatExchange(kv: Redis, entry: Omit<ChatLogEntry, 'ts'>): Promise<void> {
  try {
    const now = Date.now()
    await Promise.all([
      kv.zadd(CHAT_LOG_KEY, { score: now, member: JSON.stringify({ ...entry, ts: now }) }),
      kv.zremrangebyscore(CHAT_LOG_KEY, 0, now - CHAT_LOG_TTL_MS),
      kv.zremrangebyrank(CHAT_LOG_KEY, 0, -CHAT_LOG_MAX_ENTRIES - 1)
    ])
  } catch (err) {
    console.error('Chat log write error:', err)
  }
}

export interface ChatDemand {
  requests: number
  cached: number
  plus: number
  topQuestions: { q: string; count: number }[]
  topIntents: { name: string; count: number }[]
  topTitles: { title: string; count: number }[]
  recent: ChatLogEntry[]
}

export function summarizeChatLog(entries: ChatLogEntry[]): Omit<ChatDemand, 'recent'> {
  const questions = new Map<string, { display: string; count: number }>()
  const intents = new Map<string, number>()
  const titles = new Map<string, number>()
  let cached = 0
  let plus = 0
  for (const e of entries) {
    if (e.cached) cached++
    if (e.plus) plus++
    const key = e.q.toLowerCase().replace(/\s+/g, ' ').trim()
    const q = questions.get(key) || { display: e.q.trim(), count: 0 }
    q.count++
    questions.set(key, q)
    for (const i of e.intents ?? []) intents.set(i, (intents.get(i) ?? 0) + 1)
    for (const t of e.titles ?? []) titles.set(t, (titles.get(t) ?? 0) + 1)
  }
  return {
    requests: entries.length,
    cached,
    plus,
    topQuestions: [...questions.values()].sort((a, b) => b.count - a.count).slice(0, 10).map((x) => ({ q: x.display, count: x.count })),
    topIntents: [...intents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    topTitles: [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count }))
  }
}

export async function getChatDemand(kv: Redis, days = 7): Promise<ChatDemand> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const raw = await kv.zrange(CHAT_LOG_KEY, cutoff, '+inf', { byScore: true })
  const entries: ChatLogEntry[] = []
  for (const m of raw ?? []) {
    try {
      entries.push(typeof m === 'string' ? JSON.parse(m) : (m as ChatLogEntry))
    } catch {}
  }
  return { ...summarizeChatLog(entries), recent: entries.slice(-8).reverse() }
}
