import { getRedis } from './redis'
import { curatedLists, type ListDef } from './curatedLists'
import type { TmdbParams } from './tmdb'

// Each Redis command is billed on Upstash's free tier, so lists and seed
// statuses live in single hashes (one HGETALL) instead of per-slug keys —
// the old layout cost SMEMBERS + N GETs per read. Legacy `content:list:*` /
// `content:queue:*` keys are lazily migrated on read; LIST_INDEX_KEY /
// QUEUE_KEY remain only to find stragglers written before the migration.
const LISTS_HASH_KEY = 'content:lists'
const LIST_KEY = 'content:list'
const LIST_INDEX_KEY = 'content:lists:index'
const QUEUE_HASH_KEY = 'content:queue'
const QUEUE_KEY = 'content:queue'
const RUN_LOG_KEY = 'content:runs'
const MAX_RUN_LOG_ENTRIES = 50

export const MAX_GENERATED_LISTS = 100

export interface SeedStatus {
  status: 'approved' | 'rejected' | 'failed'
  reason?: string
  attempts?: number
  processedAt?: number
}

export function paramsSignature(params: TmdbParams = {}): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

export async function getGeneratedList(slug: string): Promise<ListDef | null> {
  const kv = getRedis()
  if (!kv) return null
  try {
    const stored = await kv.hget<ListDef>(LISTS_HASH_KEY, slug)
    if (stored) return stored
    const legacy = await kv.get<ListDef>(`${LIST_KEY}:${slug}`)
    if (legacy) {
      await kv.hset(LISTS_HASH_KEY, { [slug]: legacy })
      await kv.srem(LIST_INDEX_KEY, slug)
    }
    return legacy
  } catch (err) {
    console.error(`Redis get error for generated list ${slug}:`, err)
    return null
  }
}

export async function getGeneratedLists(): Promise<Record<string, ListDef>> {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const [stored, legacySlugs] = await Promise.all([
      kv.hgetall<Record<string, ListDef>>(LISTS_HASH_KEY),
      kv.smembers<string[]>(LIST_INDEX_KEY)
    ])
    const lists: Record<string, ListDef> = { ...(stored || {}) }
    const pending = (legacySlugs || []).filter((slug) => lists[slug] === undefined)
    if (pending.length === 0) return lists

    const defs = await Promise.all(pending.map((slug) => kv.get<ListDef>(`${LIST_KEY}:${slug}`)))
    const migrated: Record<string, ListDef> = {}
    pending.forEach((slug, i) => {
      const def = defs[i]
      if (def) {
        lists[slug] = def
        migrated[slug] = def
      }
    })
    if (Object.keys(migrated).length) {
      await kv.hset(LISTS_HASH_KEY, migrated)
      await kv.srem(LIST_INDEX_KEY, ...pending)
    }
    return lists
  } catch (err) {
    console.error('Redis error reading generated lists:', err)
    return {}
  }
}

export async function getAllLists(): Promise<Record<string, ListDef>> {
  const generated = await getGeneratedLists()
  return { ...generated, ...curatedLists }
}

export async function saveGeneratedList(slug: string, def: ListDef): Promise<boolean> {
  const kv = getRedis()
  if (!kv) return false
  // Legacy per-slug keys still count toward the cap until they're migrated.
  const [hashCount, legacyCount] = await Promise.all([
    kv.hlen(LISTS_HASH_KEY),
    kv.scard(LIST_INDEX_KEY)
  ])
  if (hashCount + legacyCount >= MAX_GENERATED_LISTS) return false
  await kv.hset(LISTS_HASH_KEY, { [slug]: def })
  // Re-saving a still-legacy slug would leave it counted in both stores.
  await kv.srem(LIST_INDEX_KEY, slug)
  return true
}

export async function getSeedStatuses(slugs: string[]): Promise<Record<string, SeedStatus | null>> {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const stored = (await kv.hgetall<Record<string, SeedStatus>>(QUEUE_HASH_KEY)) || {}
    const missing = slugs.filter((slug) => stored[slug] === undefined)
    const statuses: Record<string, SeedStatus | null> = {}
    for (const slug of slugs) statuses[slug] = stored[slug] ?? null
    if (missing.length === 0) return statuses

    const legacy = await Promise.all(missing.map((slug) => kv.get<SeedStatus>(`${QUEUE_KEY}:${slug}`)))
    const migrated: Record<string, SeedStatus> = {}
    missing.forEach((slug, i) => {
      const status = legacy[i]
      if (status) {
        statuses[slug] = status
        migrated[slug] = status
      }
    })
    if (Object.keys(migrated).length) await kv.hset(QUEUE_HASH_KEY, migrated)
    return statuses
  } catch (err) {
    console.error('Redis error reading seed statuses:', err)
    return {}
  }
}

export async function setSeedStatus(slug: string, status: SeedStatus): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  try {
    await kv.hset(QUEUE_HASH_KEY, { [slug]: { ...status, processedAt: Date.now() } })
  } catch (err) {
    console.error(`Redis set error for seed ${slug}:`, err)
  }
}

export async function appendRunLog(entry: Record<string, unknown>): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  try {
    await kv.lpush(RUN_LOG_KEY, { ...entry, ranAt: Date.now() })
    await kv.ltrim(RUN_LOG_KEY, 0, MAX_RUN_LOG_ENTRIES - 1)
  } catch (err) {
    console.error('Redis error appending content run log:', err)
  }
}
