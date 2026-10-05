import type { Redis } from '@upstash/redis'
import { getRedis } from './redis'
import { aiParams, recordAiUsage, getOpenAIClient } from './openai'
import { checkGlobalBudget } from './rateLimiter'
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

const SIMILAR_CACHE_VERSION = 'v2'
const SIMILAR_TTL_SECONDS = 60 * 60 * 24 * 365
const MAX_OVERVIEW_LENGTH = 200
const MAX_CANDIDATES = 6
const MAX_RESULTS = 5

const memorySimilarCache = new LRUCache<string, SimilarTitle[]>({ max: 500, ttl: SIMILAR_TTL_SECONDS * 1000 })

const MAX_GLOBAL_GENERATIONS_PER_MINUTE = 20

// tv keys are namespaced — movie and tv ids overlap in TMDB.
function cacheKey(movieId: number | string, mediaType: MediaType = 'movie'): string {
  return mediaType === 'tv'
    ? `ai_similar:${SIMILAR_CACHE_VERSION}:tv:${movieId}`
    : `ai_similar:${SIMILAR_CACHE_VERSION}:${movieId}`
}

async function readCache(kv: Redis | null, key: string): Promise<SimilarTitle[] | null> {
  const local = memorySimilarCache.get(key)
  if (local) return local
  if (!kv) return null
  try {
    const value = await kv.get<SimilarTitle[]>(key)
    if (value) memorySimilarCache.set(key, value)
    return value
  } catch (err) {
    console.error('Redis get error for similar-movies cache:', err)
    return null
  }
}

async function writeCache(kv: Redis | null, key: string, value: SimilarTitle[]): Promise<void> {
  memorySimilarCache.set(key, value)
  if (!kv) return
  try {
    await kv.set(key, value, { ex: SIMILAR_TTL_SECONDS })
  } catch (err) {
    console.error('Redis set error for similar-movies cache:', err)
  }
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

  const client = getOpenAIClient()
  if (!client) return []

  const withinBudget = await checkGlobalBudget('ai_similar', {
    maxRequests: MAX_GLOBAL_GENERATIONS_PER_MINUTE,
    windowSeconds: 60
  })
  if (!withinBudget) {
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
    const requestStart = Date.now()
    const completion = await client.chat.completions.create({
      ...aiParams('similar', 500, 0.4),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'similar_recommendations',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              recommendations: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    reason: { type: 'string' }
                  },
                  required: ['id', 'reason'],
                  additionalProperties: false
                }
              }
            },
            required: ['recommendations'],
            additionalProperties: false
          }
        }
      },
      messages: [
        {
          role: 'system',
          content:
            `You recommend which candidate ${noun}s best suit a fan of a given ${noun}. Pick up to 5 of the best-fitting candidates, ranked best-first. Only use candidates from the provided list; do not invent ${noun}s.
Rank candidates using evidence from the supplied overviews: tone and viewing experience, then themes or premise, then style or audience appeal; treat genre as supporting evidence only. Do not infer similarity from titles alone.
Each reason must name one specific overlap with the source ${noun}, use at most 20 words, and not repeat either title.
If the supplied evidence is insufficient, return an empty array.
Respond with only a JSON object of the shape {"recommendations": [{"id": number, "reason": string}]}.`
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

    recordAiUsage('similar', completion.usage, { latencyMs: Date.now() - requestStart })

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
