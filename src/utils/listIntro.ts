import OpenAI from 'openai'
import type { Redis } from '@upstash/redis'
import { getRedis } from './redis'
import { LRUCache } from 'lru-cache'

let openai: OpenAI | undefined

const INTRO_CACHE_VERSION = 'v1'
const INTRO_TTL_SECONDS = 60 * 60 * 24 * 180
const MAX_SAMPLE_TITLES = 5

const memoryIntroCache = new LRUCache<string, string>({ max: 100, ttl: INTRO_TTL_SECONDS * 1000 })

const MAX_GLOBAL_GENERATIONS_PER_MINUTE = 10

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

function introCacheKey(slug: string): string {
  return `ai_list_intro:${INTRO_CACHE_VERSION}:${slug}`
}

async function isWithinGlobalBudget(kv: Redis): Promise<boolean> {
  const windowId = Math.floor(Date.now() / 60000)
  const key = `ai_list_intro_global_rl:${windowId}`
  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, 120)
    return count <= MAX_GLOBAL_GENERATIONS_PER_MINUTE
  } catch (err) {
    console.error('Redis error checking AI list-intro generation budget, failing open:', err)
    return true
  }
}

async function readCache(kv: Redis | null, key: string): Promise<string | null> {
  if (kv) {
    try {
      return await kv.get<string>(key)
    } catch (err) {
      console.error('Redis get error for list-intro cache:', err)
      return null
    }
  }
  return memoryIntroCache.get(key) || null
}

async function writeCache(kv: Redis | null, key: string, value: string): Promise<void> {
  if (kv) {
    try {
      await kv.set(key, value, { ex: INTRO_TTL_SECONDS })
      return
    } catch (err) {
      console.error('Redis set error for list-intro cache:', err)
    }
  }
  memoryIntroCache.set(key, value)
}

// Cache-first and safe to call from getServerSideProps — OpenAI generation is
// capped globally so a crawler burst can't spike spend.
export async function getOrGenerateListIntro({ slug, title, tagline, sampleTitles = [] }: {
  slug: string
  title: string
  tagline?: string
  sampleTitles?: string[]
}): Promise<string | null> {
  if (!slug || !title) return null

  const kv = getRedis()
  const key = introCacheKey(slug)

  const cached = await readCache(kv, key)
  if (cached) return cached

  const client = getOpenAI()
  if (!client) return null

  if (kv && !(await isWithinGlobalBudget(kv))) {
    console.warn(`AI list-intro generation budget exceeded; skipping generation for list ${slug}`)
    return null
  }

  const examples = sampleTitles.slice(0, MAX_SAMPLE_TITLES).join(', ')

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 220,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content:
            'Write a short (2-3 sentence) editorial intro for a curated movie collection page. Explain the angle/appeal of the collection itself. Do not describe or rate any single movie in detail, and do not invent facts about specific films.'
        },
        {
          role: 'user',
          content: `Collection title: "${title}". One-line description: "${tagline}". A few movies currently in it: ${examples || 'varies'}. Write the intro.`
        }
      ]
    })

    const introText = completion.choices[0]?.message?.content?.trim()
    if (!introText) return null

    await writeCache(kv, key, introText)
    return introText
  } catch (err) {
    console.error(`Error generating AI intro for list ${slug}:`, err)
    return null
  }
}
