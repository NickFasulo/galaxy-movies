import { LRUCache } from 'lru-cache'
import { getRedis } from './redis'
import { aiModel } from './openai'

interface AnalyticsRecord {
  timestamp: number
  messageCount?: number
  [key: string]: unknown
}

export const localAnalytics = new LRUCache<string, AnalyticsRecord>({ max: 10000, ttl: 1000 * 60 * 60 * 24 })

// Every INCRBY is a billed Upstash command, so counter deltas accumulate in
// memory and flush in one batch — stats lag by up to COUNTER_FLUSH_MS and an
// instance dying loses its unflushed tail (same tradeoff as ai_usage).
const pendingCounters = new Map<string, number>()
let lastCounterFlush = 0
const COUNTER_FLUSH_MS = 30 * 1000

export function bumpCounter(key: string, delta: number): void {
  const kv = getRedis()
  if (!kv) return
  pendingCounters.set(key, (pendingCounters.get(key) || 0) + delta)
  const now = Date.now()
  if (now - lastCounterFlush < COUNTER_FLUSH_MS) return
  lastCounterFlush = now
  const ops = [...pendingCounters.entries()].map(([k, d]) => kv.incrby(k, d))
  pendingCounters.clear()
  Promise.all(ops).catch((err) => console.error('Redis analytics counter flush error:', err))
}

export async function getUsageStats(timeframe = '24h') {
  const kv = getRedis()

  if (!kv) {
    return getLocalUsageStats()
  }

  try {
    const now = Date.now()
    const [totalSessions, totalMessages, totalRating, ratingCount] = await kv.mget<[
      number | null, number | null, number | null, number | null
    ]>('analytics:total_sessions', 'analytics:total_messages', 'analytics:total_rating', 'analytics:rating_count')
    const avgRating = totalRating && ratingCount ? (totalRating / ratingCount).toFixed(1) : null

    return {
      totalSessions,
      totalMessages,
      avgRating,
      timeframe,
      timestamp: now
    }
  } catch (err) {
    console.error('Redis stats error:', err)
    return getLocalUsageStats()
  }
}

function getLocalUsageStats() {
  const sessions = Array.from(localAnalytics.values())
    .filter((data) => data.timestamp)

  return {
    totalSessions: sessions.length,
    totalMessages: sessions.reduce((sum, data) => sum + (data.messageCount || 0), 0),
    avgRating: null,
    timeframe: 'local',
    timestamp: Date.now()
  }
}

export async function getCostEstimate() {
  const kv = getRedis()

  const pricing: Record<string, { input: number; cachedInput?: number; cacheWrite?: number; output: number }> = {
    'gpt-6-luna': {
      input: 0.0001,
      cachedInput: 0.00001,
      cacheWrite: 0.000125,
      output: 0.0005
    },
    'gpt-4o-mini': {
      input: 0.00015,
      cachedInput: 0.000075,
      output: 0.0006
    }
  }
  const defaultRates = pricing['gpt-6-luna']

  // Prefer real token usage recorded per task/model; fall back to the
  // message-count estimate for pre-migration traffic or missing Redis.
  if (kv) {
    try {
      const usage = await kv.hgetall<Record<string, number>>('ai_usage')
      if (usage && Object.keys(usage).length) {
        type Metric = 'input' | 'output' | 'reasoning' | 'cached' | 'cache_write' | 'uncached' | 'latency_ms' | 'ttft_ms' | 'requests'
        const zero = (): Record<Metric, number> => ({
          input: 0, output: 0, reasoning: 0, cached: 0, cache_write: 0, uncached: 0, latency_ms: 0, ttft_ms: 0, requests: 0
        })
        const tasks: Record<string, Record<Metric, number>> = {}
        for (const [field, raw] of Object.entries(usage)) {
          const m = field.match(/^(.+)\.(chat|review|intro|similar|tagline|discover)\.(input|output|reasoning|cached|cache_write|uncached|latency_ms|ttft_ms|requests)$/)
          if (!m) continue
          const key = `${m[1]}/${m[2]}`
          const bucket = tasks[key] || (tasks[key] = zero())
          bucket[m[3] as Metric] += Number(raw) || 0
        }
        let totalCost = 0
        const breakdown: Record<string, string> = {}
        for (const [key, t] of Object.entries(tasks)) {
          const [modelName, task] = key.split('/')
          const rates = pricing[modelName] || defaultRates
          const uncached = t.uncached || Math.max(0, t.input - t.cached - t.cache_write)
          const cost =
            (uncached / 1000) * rates.input +
            (t.cached / 1000) * (rates.cachedInput ?? rates.input) +
            (t.cache_write / 1000) * (rates.cacheWrite ?? rates.input) +
            (t.output / 1000) * rates.output
          totalCost += cost
          const hitRate = t.input ? `, ${Math.round((100 * t.cached) / t.input)}% cached` : ''
          const avgLatency = t.requests && t.latency_ms ? `, ${Math.round(t.latency_ms / t.requests)}ms avg` : ''
          breakdown[`${modelName}/${task}`] = `$${cost.toFixed(4)} (${t.requests} reqs${hitRate}${avgLatency})`
        }
        return { estimatedCost: totalCost.toFixed(4), source: 'actual_usage', breakdown }
      }
    } catch (err) {
      console.error('Redis AI usage read error:', err)
    }
  }

  const model = aiModel('chat')
  const avgTokensPerMessage = {
    input: 150,
    output: 200
  }

  let totalMessages = 0
  if (kv) {
    try {
      totalMessages = (await kv.get<number>('analytics:total_messages')) || 0
    } catch (err) {
      console.error('Redis cost estimation error:', err)
    }
  } else {
    totalMessages = Array.from(localAnalytics.values())
      .reduce((sum, data) => sum + (data.messageCount || 0), 0)
  }

  const rates = pricing[model] || defaultRates
  const inputCost = (totalMessages * avgTokensPerMessage.input / 1000) * rates.input
  const outputCost = (totalMessages * avgTokensPerMessage.output / 1000) * rates.output
  const totalCost = inputCost + outputCost

  return {
    model,
    totalMessages,
    estimatedCost: totalCost.toFixed(4),
    source: 'estimated',
    breakdown: {
      input: inputCost.toFixed(4),
      output: outputCost.toFixed(4)
    }
  }
}
