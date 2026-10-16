import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis } from '../../utils/redis'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/api'
import { isCronAuthorized } from '../../utils/auth'
import { firstParam } from '../../utils/query'
import { bumpCounter, getCostEstimate, getUsageStats, localAnalytics } from '../../utils/aiUsage'

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
      await kv.set(`chat_session:${sessionId}`, analyticsData, { ex: 60 * 60 * 24 * 30 })

      bumpCounter('analytics:total_sessions', 1)
      bumpCounter('analytics:total_messages', analyticsData.messageCount)

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
      await kv.set(`chat_feedback:${feedbackId}`, feedback, { ex: 60 * 60 * 24 * 90 })

      if (feedback.rating) {
        bumpCounter('analytics:total_rating', feedback.rating)
        bumpCounter('analytics:rating_count', 1)
      }

      return feedbackId
    } catch (err) {
      console.error('Redis feedback error:', err)
    }
  }

  localAnalytics.set(feedbackId, feedback)
  return feedbackId
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (rejectBot(req, res)) return

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

  requireMethod(req, res, ['GET', 'POST'])
}