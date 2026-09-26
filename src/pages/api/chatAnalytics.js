import { LRUCache } from 'lru-cache'
import { Redis } from '@upstash/redis'

let redis

const analyticsCache = new LRUCache({ max: 5000, ttl: 1000 * 60 * 60 * 24 })

const localAnalytics = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 * 24 })

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5kb'
    }
  }
}

function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_KV_REST_API_URL || !process.env.UPSTASH_REDIS_KV_REST_API_TOKEN) {
    return null
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN,
  })
  return redis
}

function getClientIdentifier(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0])?.trim()
    || req.socket.remoteAddress
    || 'unknown'
}

async function trackChatSession(sessionData) {
  const kv = getRedis()
  const sessionId = sessionData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const analyticsData = {
    sessionId,
    timestamp: Date.now(),
    messageCount: sessionData.messageCount || 0,
    duration: sessionData.duration || 0,
    userSatisfaction: sessionData.userSatisfaction || null,
    featuresUsed: sessionData.featuresUsed || [],
    clientId: sessionData.clientId
  }

  if (kv) {
    try {
      await kv.hset(`chat_session:${sessionId}`, analyticsData)
      await kv.expire(`chat_session:${sessionId}`, 60 * 60 * 24 * 30)
      
      await kv.incr('analytics:total_sessions')
      await kv.incrby('analytics:total_messages', sessionData.messageCount || 0)
      
      return sessionId
    } catch (err) {
      console.error('Redis analytics error:', err)
    }
  }

  localAnalytics.set(sessionId, analyticsData)
  return sessionId
}

async function recordFeedback(feedbackData) {
  const kv = getRedis()
  const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const feedback = {
    feedbackId,
    timestamp: Date.now(),
    rating: feedbackData.rating,
    comment: feedbackData.comment || '',
    sessionId: feedbackData.sessionId,
    recommendationType: feedbackData.recommendationType || 'general',
    helpful: feedbackData.helpful
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
    const timeframes = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }

    const cutoffTime = now - (timeframes[timeframe] || timeframes['24h'])
    
    const totalSessions = await kv.get('analytics:total_sessions') || 0
    const totalMessages = await kv.get('analytics:total_messages') || 0
    const avgRating = await kv.get('analytics:total_rating') && await kv.get('analytics:rating_count')
      ? (await kv.get('analytics:total_rating') / await kv.get('analytics:rating_count')).toFixed(1)
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
  const sessions = Array.from(localAnalytics.entries())
    .filter(([_, data]) => data.timestamp)
  
  return {
    totalSessions: sessions.length,
    totalMessages: sessions.reduce((sum, [_, data]) => sum + (data.messageCount || 0), 0),
    avgRating: null,
    timeframe: 'local',
    timestamp: Date.now()
  }
}

async function getCostEstimate() {
  const kv = getRedis()
  
  const pricing = {
    'gpt-4o-mini': {
      input: 0.00015,
      output: 0.0006
    }
  }

  const model = 'gpt-4o-mini'
  const avgTokensPerMessage = {
    input: 150,
    output: 200
  }

  let totalMessages = 0
  if (kv) {
    try {
      totalMessages = await kv.get('analytics:total_messages') || 0
    } catch (err) {
      console.error('Redis cost estimation error:', err)
    }
  } else {
    totalMessages = Array.from(localAnalytics.entries())
      .reduce((sum, [_, data]) => sum + (data.messageCount || 0), 0)
  }

  const inputCost = (totalMessages * avgTokensPerMessage.input / 1000) * pricing[model].input
  const outputCost = (totalMessages * avgTokensPerMessage.output / 1000) * pricing[model].output
  const totalCost = inputCost + outputCost

  return {
    model,
    totalMessages,
    estimatedCost: totalCost.toFixed(4),
    breakdown: {
      input: inputCost.toFixed(4),
      output: outputCost.toFixed(4)
    }
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { action, data } = req.body

    if (action === 'track_session') {
      const clientId = getClientIdentifier(req)
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
    const { timeframe } = req.query
    
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