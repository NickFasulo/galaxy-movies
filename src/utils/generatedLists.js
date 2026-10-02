import { Redis } from '@upstash/redis'
import { curatedLists } from './curatedLists'

let redis

const LIST_KEY = 'content:list'
const LIST_INDEX_KEY = 'content:lists:index'
const QUEUE_KEY = 'content:queue'
const RUN_LOG_KEY = 'content:runs'
const MAX_RUN_LOG_ENTRIES = 50

export const MAX_GENERATED_LISTS = 100

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

export function paramsSignature(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

export async function getGeneratedList(slug) {
  const kv = getRedis()
  if (!kv) return null
  try {
    return await kv.get(`${LIST_KEY}:${slug}`)
  } catch (err) {
    console.error(`Redis get error for generated list ${slug}:`, err)
    return null
  }
}

export async function getGeneratedLists() {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const slugs = (await kv.smembers(LIST_INDEX_KEY)) || []
    if (slugs.length === 0) return {}
    const defs = await Promise.all(slugs.map((slug) => kv.get(`${LIST_KEY}:${slug}`)))
    return Object.fromEntries(
      slugs
        .map((slug, i) => [slug, defs[i]])
        .filter(([, def]) => def)
    )
  } catch (err) {
    console.error('Redis error reading generated lists:', err)
    return {}
  }
}

export async function getAllLists() {
  const generated = await getGeneratedLists()
  return { ...generated, ...curatedLists }
}

export async function saveGeneratedList(slug, def) {
  const kv = getRedis()
  if (!kv) return false
  const count = await kv.scard(LIST_INDEX_KEY)
  if (count >= MAX_GENERATED_LISTS) return false
  await kv.set(`${LIST_KEY}:${slug}`, def)
  await kv.sadd(LIST_INDEX_KEY, slug)
  return true
}

export async function getSeedStatuses(slugs) {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const statuses = await Promise.all(slugs.map((slug) => kv.get(`${QUEUE_KEY}:${slug}`)))
    return Object.fromEntries(slugs.map((slug, i) => [slug, statuses[i]]))
  } catch (err) {
    console.error('Redis error reading seed statuses:', err)
    return {}
  }
}

export async function setSeedStatus(slug, status) {
  const kv = getRedis()
  if (!kv) return
  try {
    await kv.set(`${QUEUE_KEY}:${slug}`, { ...status, processedAt: Date.now() })
  } catch (err) {
    console.error(`Redis set error for seed ${slug}:`, err)
  }
}

export async function appendRunLog(entry) {
  const kv = getRedis()
  if (!kv) return
  try {
    await kv.lpush(RUN_LOG_KEY, { ...entry, ranAt: Date.now() })
    await kv.ltrim(RUN_LOG_KEY, 0, MAX_RUN_LOG_ENTRIES - 1)
  } catch (err) {
    console.error('Redis error appending content run log:', err)
  }
}
