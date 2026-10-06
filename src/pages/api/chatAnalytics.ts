import type { NextApiRequest, NextApiResponse } from 'next'
import { LRUCache } from 'lru-cache'
import { getRedis } from '../../utils/redis'
import { isBot, getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { isCronAuthorized } from '../../utils/auth'
import { firstParam } from '../../utils/query'
import { aiModel } from '../../utils/openai'

interface AnalyticsRecord {
  timestamp: number
  messageCount?: number
  [key: string]: unknown
}

const localAnalytics = new LRUCache<string, AnalyticsRecord>({ max: 10000, ttl: 1000 * 60 * 60 * 24 })

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5kb'
    }
  }
}

const ID_PATTERN = /^[\w-]{1,64}$/

const boundedInt = (value: unknown, min: number, max: number): number => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min
}

const cleanString = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')

async function trackChatSession(sessionData: Record<string, unknown>): Promise<string> {
  const kv = getRedis()
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const analyticsData = {
    sessionId,
    timestamp: Date.now(),
    messageCount: boundedInt(sessionData.messageCount, 0, 200),
    duration: boundedInt(sessionData.duration, 0, 1000 * 60 * 60 * 24),
    userSatisfaction: null,
    featuresUsed: Array.isArray(sessionData.featuresUsed)
      ? sessionData.featuresUsed.filter((f): f is string => typeof f === 'string').slice(0, 10).map((f) => f.slice(0, 40))
      : [],
    clientId: sessionData.clientId
  }

  if (kv) {
    try {
      await kv.hset(`chat_session:${sessionId}`, analyticsData)
      await kv.expire(`chat_session:${sessionId}`, 60 * 60 * 24 * 30)
      
      await kv.incr('analytics:total_sessions')
      await kv.incrby('analytics:total_messages', analyticsData.messageCount)
      
      return sessionId
    } catch (err) {
      console.error('Redis analytics error:', err)
    }
  }

  localAnalytics.set(sessionId, analyticsData)
  return sessionId
}

async function recordFeedback(feedbackData: Record<string, unknown>): Promise<string> {
  const kv = getRedis()
  const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const feedback = {
    feedbackId,
    timestamp: Date.now(),
    rating: boundedInt(feedbackData.rating, 0, 5),
    comment: cleanString(feedbackData.comment, 500),
    sessionId: typeof feedbackData.sessionId === 'string' && ID_PATTERN.test(feedbackData.sessionId) ? feedbackData.sessionId : '',
    recommendationType: cleanString(feedbackData.recommendationType, 40) || 'general',
    helpful: feedbackData.helpful === true
  }

  if (kv) {
    try {
      await kv.hset(`chat_feedback:${feedbackId}`, feedback)
      await kv.expire(`chat_feedback:${feedbackId}`, 60 * 60 * 24 * 90)
      
      if (feedback.rating) {
        await kv.incrby('analytics:total_rating', feedback.rating)
        await kv.incr('analytics:rating_count')
      }
      
      return feedbackId
    } catch (err) {
      console.error('Redis feedback error:', err)
    }
  }

  localAnalytics.set(feedbackId, feedback)
  return feedbackId
}

async function getUsageStats(timeframe = '24h') {
  const kv = getRedis()
  
  if (!kv) {
    return getLocalUsageStats()
  }

  try {
    const now = Date.now()
    const totalSessions = (await kv.get<number>('analytics:total_sessions')) || 0
    const totalMessages = (await kv.get<number>('analytics:total_messages')) || 0
    const avgRating = (await kv.get<number>('analytics:total_rating')) && (await kv.get<number>('analytics:rating_count'))
      ? (((await kv.get<number>('analytics:total_rating')) ?? 0) / ((await kv.get<number>('analytics:rating_count')) ?? 1)).toFixed(1)
      : null

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

async function getCostEstimate() {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

  if (req.method === 'POST') {
    const clientId = getClientIP(req)
    const allowed = await checkDistributedRateLimit(clientId, {
      keyPrefix: 'analytics_rl',
      maxRequests: 30,
      windowSeconds: 60 * 60
    })
    if (!allowed) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' })
    }

    const { action } = req.body || {}
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}

    if (action === 'track_session') {
      const sessionId = await trackChatSession({
        ...data,
        clientId
      })
      return res.status(200).json({ sessionId })
    }

    if (action === 'record_feedback') {
      const feedbackId = await recordFeedback(data)
      return res.status(200).json({ feedbackId })
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  if (req.method === 'GET') {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const timeframe = firstParam(req.query.timeframe)
    
    if (req.query.action === 'stats') {
      const stats = await getUsageStats(timeframe)
      return res.status(200).json(stats)
    }

    if (req.query.action === 'costs') {
      const costs = await getCostEstimate()
      return res.status(200).json(costs)
    }

    return res.status(400).json({ error: 'Invalid action' })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end(`Method ${req.method} Not Allowed`)
}