import OpenAI from 'openai'
import type { Redis } from '@upstash/redis'
import { getRedis } from './redis'
import { LRUCache } from 'lru-cache'
import type { MediaType } from '../types/tmdb'

export interface SimilarCandidate {
  id: number
  title: string
  overview?: string
  poster_path?: string | null
  release_date?: string
}

export interface SimilarTitle {
  id: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  reason: string
  mediaType: MediaType
}

let openai: OpenAI | undefined

const SIMILAR_CACHE_VERSION = 'v1'
const SIMILAR_TTL_SECONDS = 60 * 60 * 24 * 90
const MAX_OVERVIEW_LENGTH = 300
const MAX_CANDIDATES = 8
const MAX_RESULTS = 5

const memorySimilarCache = new LRUCache<string, SimilarTitle[]>({ max: 500, ttl: SIMILAR_TTL_SECONDS * 1000 })

const MAX_GLOBAL_GENERATIONS_PER_MINUTE = 20

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

// tv keys are namespaced — movie and tv ids overlap in TMDB.
function cacheKey(movieId: number | string, mediaType: MediaType = 'movie'): string {
  return mediaType === 'tv'
    ? `ai_similar:${SIMILAR_CACHE_VERSION}:tv:${movieId}`
    : `ai_similar:${SIMILAR_CACHE_VERSION}:${movieId}`
}

async function isWithinGlobalBudget(kv: Redis): Promise<boolean> {
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

async function readCache(kv: Redis | null, key: string): Promise<SimilarTitle[] | null> {
  if (kv) {
    try {
      return await kv.get<SimilarTitle[]>(key)
    } catch (err) {
      console.error('Redis get error for similar-movies cache:', err)
      return null
    }
  }
  return memorySimilarCache.get(key) || null
}

async function writeCache(kv: Redis | null, key: string, value: SimilarTitle[]): Promise<void> {
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

// Cache-first and safe to call from getServerSideProps — OpenAI generation is
// capped globally so a crawler burst can't spike spend.
export async function getOrGenerateSimilarMovies({ movieId, title, overview, genres = [], candidates = [], mediaType = 'movie' }: {
  movieId: number
  title: string
  overview?: string
  genres?: string[]
  candidates?: SimilarCandidate[]
  mediaType?: MediaType
}): Promise<SimilarTitle[]> {
  if (!movieId || !title || candidates.length === 0) return []

  const kv = getRedis()
  const key = cacheKey(movieId, mediaType)

  const cached = await readCache(kv, key)
  if (cached) return cached

  const client = getOpenAI()
  if (!client) return []

  if (kv && !(await isWithinGlobalBudget(kv))) {
    console.warn(`AI similar-movies generation budget exceeded; skipping generation for movie ${movieId}`)
    return []
  }

  const noun = mediaType === 'tv' ? 'TV show' : 'movie'

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
            `You recommend which candidate ${noun}s best suit a fan of a given ${noun}. Pick up to 5 of the best-fitting candidates and, for each, write one short reason (under 20 words) tied to specific tone, theme, or style overlap with the source ${noun} — not just a shared genre label. Only use candidates from the provided list; do not invent ${noun}s. Respond with only a JSON object of the shape {"recommendations": [{"id": number, "reason": string}]}, ranked best-first. If none fit well, return an empty array.`
        },
        {
          role: 'user',
          content: JSON.stringify({
            sourceTitle: {
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
    const picks: { id?: unknown; reason?: unknown }[] = Array.isArray(parsed?.recommendations) ? parsed.recommendations : []

    const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const enriched = picks
      .filter((pick): pick is { id: number; reason: string } => Boolean(pick && candidateMap.has(pick.id as number) && typeof pick.reason === 'string' && pick.reason.trim()))
      .slice(0, MAX_RESULTS)
      .map((pick) => {
        const candidate = candidateMap.get(pick.id)!
        return {
          id: candidate.id,
          title: candidate.title,
          posterPath: candidate.poster_path || null,
          releaseDate: candidate.release_date || null,
          reason: pick.reason.trim(),
          mediaType
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
