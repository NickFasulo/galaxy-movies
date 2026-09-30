import OpenAI from 'openai'
import { Redis } from '@upstash/redis'
import { LRUCache } from 'lru-cache'

let openai
let redis

const REVIEW_CACHE_VERSION = 'v1'
const REVIEW_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days — long-lived since overviews rarely change
const MAX_OVERVIEW_LENGTH = 1200

// Fallback in-memory cache used only when Redis isn't configured (e.g. local dev).
const memoryReviewCache = new LRUCache({ max: 500, ttl: REVIEW_TTL_SECONDS * 1000 })

// Hard ceiling on OpenAI generations per minute across all requests, so a burst of
// crawler traffic hitting many never-before-seen movies at once can't run up cost.
const MAX_GLOBAL_GENERATIONS_PER_MINUTE = 20

function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_KV_REST_API_URL || !process.env.UPSTASH_REDIS_KV_REST_API_TOKEN) {
    return null
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN
  })
  return redis
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null
  openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

function reviewCacheKey(movieId) {
  return `ai_review:${REVIEW_CACHE_VERSION}:${movieId}`
}

async function isWithinGlobalBudget(kv) {
  const windowId = Math.floor(Date.now() / 60000)
  const key = `ai_review_global_rl:${windowId}`
  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, 120)
    return count <= MAX_GLOBAL_GENERATIONS_PER_MINUTE
  } catch (err) {
    console.error('Redis error checking AI review generation budget, failing open:', err)
    return true
  }
}

async function readCache(kv, key) {
  if (kv) {
    try {
      return await kv.get(key)
    } catch (err) {
      console.error('Redis get error for review cache:', err)
      return null
    }
  }
  return memoryReviewCache.get(key) || null
}

async function writeCache(kv, key, value) {
  if (kv) {
    try {
      await kv.set(key, value, { ex: REVIEW_TTL_SECONDS })
      return
    } catch (err) {
      console.error('Redis set error for review cache:', err)
    }
  }
  memoryReviewCache.set(key, value)
}

/**
 * Returns a cached AI-generated synopsis/review for a movie, generating and persisting
 * one via OpenAI on first request if none exists yet. Safe to call from
 * getServerSideProps: cache hits are essentially free and instant, and generation is
 * capped globally so a burst of first-time views can't spike OpenAI spend.
 */
export async function getOrGenerateMovieReview({ movieId, title, overview, genres = [] }) {
  if (!movieId || !title || !overview) return null

  const trimmedOverview = overview.slice(0, MAX_OVERVIEW_LENGTH)
  const kv = getRedis()
  const key = reviewCacheKey(movieId)

  const cached = await readCache(kv, key)
  if (cached) return cached

  const client = getOpenAI()
  if (!client) return null

  if (kv && !(await isWithinGlobalBudget(kv))) {
    console.warn(`AI review generation budget exceeded; skipping generation for movie ${movieId}`)
    return null
  }

  try {
    const completion = await client.chat.completions.create({
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
          content: `Give a short review of the ${genres.join(', ') || 'movie'} "${title}" based only on this overview. Include who may enjoy it and one potential drawback: ${trimmedOverview}`
        }
      ]
    })

    const reviewText = completion.choices[0]?.message?.content?.trim()
    if (!reviewText) return null

    await writeCache(kv, key, reviewText)
    return reviewText
  } catch (err) {
    console.error(`Error generating AI review for movie ${movieId}:`, err)
    return null
  }
}
