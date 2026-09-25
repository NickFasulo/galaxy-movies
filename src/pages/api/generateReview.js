import OpenAI from 'openai'
import { createHash } from 'crypto'
import { LRUCache } from 'lru-cache'
import { Redis } from '@upstash/redis'
const { isBot, getClientIP, checkRateLimit: checkGlobalRateLimit } = require('../../utils/rateLimiter')

let openai
let redis

const reviewCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 * 24 * 7 })

const localRequestLimits = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 })

const MAX_REQUESTS_PER_HOUR = 5
const MAX_TEXT_LENGTH = 1200
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8kb'
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

function getReviewKey(modalData) {
  return createHash('sha256')
    .update(JSON.stringify({
      title: modalData.title,
      overview: modalData.overview,
      genres: modalData.genres
    }))
    .digest('hex')
}

async function checkRateLimit(clientId) {
  const kv = getRedis()

  if (kv) {
    try {
      const key = `review_rl:${clientId}`
      const count = await kv.incr(key)
      if (count === 1) {
        await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS)
      }
      return count <= MAX_REQUESTS_PER_HOUR
    } catch (err) {
      console.error('Redis rate limit error, failing open:', err)
      return true
    }
  }

  const count = (localRequestLimits.get(clientId) || 0) + 1
  localRequestLimits.set(clientId, count)
  return count <= MAX_REQUESTS_PER_HOUR
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const ip = getClientIP(req)
  const userAgent = req.headers['user-agent']
  
  if (isBot(userAgent)) {
    return res.status(403).json({ error: 'Bot access denied' })
  }
  
  const rateLimitResult = checkGlobalRateLimit(ip, 'strict')
  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000))
    return res.status(429).json({ error: rateLimitResult.reason })
  }
  
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining)

  const modalData = req.body?.modalData
  const genres = Array.isArray(modalData?.genres)
    ? modalData.genres.map(genre => genre?.name).filter(Boolean).slice(0, 5)
    : []

  if (
    typeof modalData?.title !== 'string'
    || typeof modalData?.overview !== 'string'
    || !modalData.title.trim()
    || !modalData.overview.trim()
    || modalData.title.length > 200
    || modalData.overview.length > MAX_TEXT_LENGTH
  ) {
    return res.status(400).json({ error: 'A valid movie title and overview are required' })
  }

  const clientId = getClientIdentifier(req)
  const allowed = await checkRateLimit(clientId)
  if (!allowed) {
    res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_SECONDS))
    return res.status(429).json({ error: 'Review request limit reached. Please try again later.' })
  }

  const reviewKey = getReviewKey(modalData)
  const cachedReview = reviewCache.get(reviewKey)
  if (cachedReview) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
    return res.status(200).json({ review: cachedReview, cached: true })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI reviews are temporarily unavailable.' })
  }

  try {
    openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const review = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 350,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            'Write a concise, spoiler-free, clearly subjective movie recommendation. Do not invent facts or claim to be a professional critic.'
        },
        {
          role: 'user',
          content: `Give a short review of the ${genres.join(', ') || 'movie'} "${modalData.title}" based only on this overview. Include who may enjoy it and one potential drawback: ${modalData.overview}`
        }
      ]
    })
    const reviewText = review.choices[0]?.message?.content?.trim()
    if (!reviewText) {
      throw new Error('OpenAI returned an empty review')
    }

    reviewCache.set(reviewKey, reviewText)
    
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
    
    return res.status(200).json({ review: reviewText, cached: false })
  } catch (error) {
    console.error('Error generating review:', error)
    return res.status(500).json({ error: 'Failed to generate review' })
  }
}
