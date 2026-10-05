import { getRedis } from './redis'
import { curatedLists, type ListDef } from './curatedLists'
import type { TmdbParams } from './tmdb'

const LIST_KEY = 'content:list'
const LIST_INDEX_KEY = 'content:lists:index'
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
    return await kv.get<ListDef>(`${LIST_KEY}:${slug}`)
  } catch (err) {
    console.error(`Redis get error for generated list ${slug}:`, err)
    return null
  }
}

export async function getGeneratedLists(): Promise<Record<string, ListDef>> {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const slugs = (await kv.smembers<string[]>(LIST_INDEX_KEY)) || []
    if (slugs.length === 0) return {}
    const defs = await Promise.all(slugs.map((slug) => kv.get<ListDef>(`${LIST_KEY}:${slug}`)))
    return Object.fromEntries(
      slugs
        .map((slug, i) => [slug, defs[i]] as const)
        .filter((entry): entry is readonly [string, ListDef] => Boolean(entry[1]))
    )
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
  const count = await kv.scard(LIST_INDEX_KEY)
  if (count >= MAX_GENERATED_LISTS) return false
  await kv.set(`${LIST_KEY}:${slug}`, def)
  await kv.sadd(LIST_INDEX_KEY, slug)
  return true
}

export async function getSeedStatuses(slugs: string[]): Promise<Record<string, SeedStatus | null>> {
  const kv = getRedis()
  if (!kv) return {}
  try {
    const statuses = await Promise.all(slugs.map((slug) => kv.get<SeedStatus>(`${QUEUE_KEY}:${slug}`)))
    return Object.fromEntries(slugs.map((slug, i) => [slug, statuses[i]]))
  } catch (err) {
    console.error('Redis error reading seed statuses:', err)
    return {}
  }
}

export async function setSeedStatus(slug: string, status: SeedStatus): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  try {
    await kv.set(`${QUEUE_KEY}:${slug}`, { ...status, processedAt: Date.now() })
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
