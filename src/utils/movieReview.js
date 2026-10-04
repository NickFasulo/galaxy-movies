import OpenAI from 'openai'
import { Redis } from '@upstash/redis'
import { LRUCache } from 'lru-cache'

let openai
let redis

const REVIEW_CACHE_VERSION = 'v1'
const REVIEW_TTL_SECONDS = 60 * 60 * 24 * 90
const MAX_OVERVIEW_LENGTH = 1200

const memoryReviewCache = new LRUCache({ max: 500, ttl: REVIEW_TTL_SECONDS * 1000 })

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

// tv keys are namespaced — movie and tv ids overlap in TMDB.
function reviewCacheKey(movieId, mediaType = 'movie') {
  return mediaType === 'tv'
    ? `ai_review:${REVIEW_CACHE_VERSION}:tv:${movieId}`
    : `ai_review:${REVIEW_CACHE_VERSION}:${movieId}`
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

// Cache-first and safe to call from getServerSideProps — OpenAI generation is
// capped globally so a crawler burst can't spike spend.
export async function getOrGenerateMovieReview({ movieId, title, overview, genres = [], mediaType = 'movie' }) {
  if (!movieId || !title || !overview) return null

  const trimmedOverview = overview.slice(0, MAX_OVERVIEW_LENGTH)
  const kv = getRedis()
  const key = reviewCacheKey(movieId, mediaType)

  const cached = await readCache(kv, key)
  if (cached) return cached

  const client = getOpenAI()
  if (!client) return null

  if (kv && !(await isWithinGlobalBudget(kv))) {
    console.warn(`AI review generation budget exceeded; skipping generation for movie ${movieId}`)
    return null
  }

  const noun = mediaType === 'tv' ? 'TV show' : 'movie'

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 350,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            `Write a concise, spoiler-free, clearly subjective ${noun} recommendation. Do not invent facts or claim to be a professional critic.`
        },
        {
          role: 'user',
          content: `Give a short review of the ${genres.join(', ') || noun} "${title}" based only on this overview. Include who may enjoy it and one potential drawback: ${trimmedOverview}`
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
