import OpenAI from 'openai'
import { Redis } from '@upstash/redis'
import { LRUCache } from 'lru-cache'

let openai
let redis

const SIMILAR_CACHE_VERSION = 'v1'
const SIMILAR_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days — same rationale as the synopsis cache
const MAX_OVERVIEW_LENGTH = 300
const MAX_CANDIDATES = 8
const MAX_RESULTS = 5

// Fallback in-memory cache used only when Redis isn't configured (e.g. local dev).
const memorySimilarCache = new LRUCache({ max: 500, ttl: SIMILAR_TTL_SECONDS * 1000 })

// Hard ceiling on OpenAI generations per minute across all requests, so a burst of
// crawler traffic hitting many never-before-seen movies at once can't run up cost.
// Kept as its own budget bucket, separate from the synopsis generator's.
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

function cacheKey(movieId) {
  return `ai_similar:${SIMILAR_CACHE_VERSION}:${movieId}`
}

async function isWithinGlobalBudget(kv) {
  const windowId = Math.floor(Date.now() / 60000)
  const key = `ai_similar_global_rl:${windowId}`
  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, 120)
    return count <= MAX_GLOBAL_GENERATIONS_PER_MINUTE
  } catch (err) {
    console.error('Redis error checking AI similar-movies generation budget, failing open:', err)
    return true
  }
}

async function readCache(kv, key) {
  if (kv) {
    try {
      return await kv.get(key)
    } catch (err) {
      console.error('Redis get error for similar-movies cache:', err)
      return null
    }
  }
  return memorySimilarCache.get(key) || null
}

async function writeCache(kv, key, value) {
  if (kv) {
    try {
      await kv.set(key, value, { ex: SIMILAR_TTL_SECONDS })
      return
    } catch (err) {
      console.error('Redis set error for similar-movies cache:', err)
    }
  }
  memorySimilarCache.set(key, value)
}

/**
 * Returns a cached, AI-curated "more like this" list for a movie — up to
 * MAX_RESULTS picks from `candidates` (TMDB's /recommendations results), each with
 * a short written reason tailored to the source movie rather than just a bare list.
 * Generates and persists the picks via OpenAI on first request; the enriched result
 * (title/poster/reason) is cached as-is, so cache hits need no further TMDB lookups.
 * Safe to call from getServerSideProps: cache hits are essentially free and instant,
 * and generation is capped globally so a burst of first-time views can't spike spend.
 */
export async function getOrGenerateSimilarMovies({ movieId, title, overview, genres = [], candidates = [] }) {
  if (!movieId || !title || candidates.length === 0) return []

  const kv = getRedis()
  const key = cacheKey(movieId)

  const cached = await readCache(kv, key)
  if (cached) return cached

  const client = getOpenAI()
  if (!client) return []

  if (kv && !(await isWithinGlobalBudget(kv))) {
    console.warn(`AI similar-movies generation budget exceeded; skipping generation for movie ${movieId}`)
    return []
  }

  const trimmedCandidates = candidates.slice(0, MAX_CANDIDATES).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    overview: (candidate.overview || '').slice(0, MAX_OVERVIEW_LENGTH)
  }))

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You recommend which candidate movies best suit a fan of a given movie. Pick up to 5 of the best-fitting candidates and, for each, write one short reason (under 20 words) tied to specific tone, theme, or style overlap with the source movie — not just a shared genre label. Only use candidates from the provided list; do not invent movies. Respond with only a JSON object of the shape {"recommendations": [{"id": number, "reason": string}]}, ranked best-first. If none fit well, return an empty array.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            sourceMovie: {
              title,
              genres,
              overview: (overview || '').slice(0, MAX_OVERVIEW_LENGTH)
            },
            candidates: trimmedCandidates
          })
        }
      ]
    })

    const raw = completion.choices[0]?.message?.content
    const parsed = raw ? JSON.parse(raw) : null
    const picks = Array.isArray(parsed?.recommendations) ? parsed.recommendations : []

    const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const enriched = picks
      .filter((pick) => pick && candidateMap.has(pick.id) && typeof pick.reason === 'string' && pick.reason.trim())
      .slice(0, MAX_RESULTS)
      .map((pick) => {
        const candidate = candidateMap.get(pick.id)
        return {
          id: candidate.id,
          title: candidate.title,
          posterPath: candidate.poster_path || null,
          releaseDate: candidate.release_date || null,
          reason: pick.reason.trim()
        }
      })

    if (enriched.length === 0) return []

    await writeCache(kv, key, enriched)
    return enriched
  } catch (err) {
    console.error(`Error generating AI similar movies for movie ${movieId}:`, err)
    return []
  }
}
