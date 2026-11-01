import { LRUCache } from 'lru-cache'
import { getRedis } from '../../lib/redis'
import type { MediaType } from '../../types/tmdb'

// Durable per-title streaming history. Monthly diffs expire in ~2 months and
// the title index only mirrors the current month — these hashes are the only
// place a title's "on service since X / left Y" record survives, so they have
// no TTL. Everything downstream (timeline UI, stay predictions, churn stats)
// reads these; writers are called once per provider inside updateStreamingChanges.
export interface TenureStint {
  // Arrival date of the current stint. Null when the title predates tracking —
  // all copy must treat null as "on service since before we tracked", never 0.
  on: string | null
  // Departure date while off-service; null while on-service.
  left: string | null
  // Number of observed arrivals. 0 = left without ever being seen arriving.
  cycles: number
}

// Provider-keyed records keep title/year for stats and reports; the
// title-keyed map stays small since the detail page already knows the title.
export interface ProviderTenureRecord extends TenureStint {
  t: string
  y: number | null
}

export interface TenureInput {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  year?: number | null
  popularity?: number
}

export type TenureRegion = 'US' | 'IN'

const titleTenureKey = (region: string) => `tenure:title:${region}`
const providerTenureKey = (region: string, provider: string) => `tenure:provider:${region}:${provider}`

const fieldOf = (t: TenureInput) => `${t.tmdbType}:${t.tmdbId}`

// Four commands per provider per cron run: one HMGET + one HSET per hash.
// HMGET batched reads keep the write path off the per-request budget radar.
export async function recordProviderMoves(
  region: TenureRegion,
  providerKey: string,
  added: TenureInput[],
  left: TenureInput[],
  today: string,
  departedDates?: Map<number, string>
): Promise<void> {
  const kv = getRedis()
  if (!kv) return

  const arriving = new Map<string, TenureInput>()
  for (const t of added) if (t.tmdbId) arriving.set(fieldOf(t), t)
  const departing = new Map<string, TenureInput>()
  for (const t of left) if (t.tmdbId) departing.set(fieldOf(t), t)
  // A title can't do both in one diff — arrivals win (re-add beats stale leave).
  for (const field of arriving.keys()) departing.delete(field)

  const fields = [...arriving.keys(), ...departing.keys()]
  if (!fields.length) return

  try {
    const tKey = titleTenureKey(region)
    const pKey = providerTenureKey(region, providerKey)
    const [prevTitle, prevProvider] = await Promise.all([
      kv.hmget<Record<string, Record<string, TenureStint>>>(tKey, ...fields).catch(() => null),
      kv.hmget<Record<string, ProviderTenureRecord>>(pKey, ...fields).catch(() => null)
    ])

    const titleWrites: Record<string, Record<string, TenureStint>> = {}
    const providerWrites: Record<string, ProviderTenureRecord> = {}

    for (const field of fields) {
      const prev = prevProvider?.[field] || null
      let stint: TenureStint

      if (arriving.has(field)) {
        stint = prev?.left
          ? { on: today, left: null, cycles: prev.cycles + 1 }
          : prev?.on != null
            ? prev // still on-service — nothing changed
            : { on: today, left: null, cycles: 1 }
      } else {
        const input = departing.get(field)!
        const date = (input.tmdbId && departedDates?.get(input.tmdbId)) || today
        stint = prev
          ? { on: prev.on ?? null, left: date, cycles: prev.cycles }
          : { on: null, left: date, cycles: 0 }
      }

      const titleMap = { ...(prevTitle?.[field] || {}), [providerKey]: stint }
      titleWrites[field] = titleMap
      providerWrites[field] = {
        ...stint,
        t: arriving.get(field)?.title || departing.get(field)?.title || prev?.t || '',
        y: (arriving.get(field) || departing.get(field))?.year ?? prev?.y ?? null
      }
    }

    await Promise.all([
      kv.hset(tKey, titleWrites),
      kv.hset(pKey, providerWrites)
    ])
  } catch (error) {
    console.error(`tenure write failed for ${providerKey}:`, error)
  }
}

const tenureMemo = new LRUCache<string, { v: Record<string, TenureStint> | null }>({ max: 2000, ttl: 10 * 60 * 1000 })

// One HGET per detail pageview — mirrors getTitleChanges' read shape.
export async function getTitleTenure(tmdbType: MediaType, tmdbId: number, region: TenureRegion = 'US'): Promise<Record<string, TenureStint> | null> {
  const memoKey = `${region}:${tmdbType}:${tmdbId}`
  const memoized = tenureMemo.get(memoKey)
  if (memoized !== undefined) return memoized.v

  const kv = getRedis()
  let entry: Record<string, TenureStint> | null = null
  if (kv) {
    try {
      entry = (await kv.hget(titleTenureKey(region), `${tmdbType}:${tmdbId}`)) as Record<string, TenureStint> | null
    } catch {}
  }
  tenureMemo.set(memoKey, { v: entry })
  return entry
}

export interface TenureStats {
  medianDays: number
  p75Days: number
  samples: number
  trackedSince: string | null
}

const statsMemo = new LRUCache<string, { v: TenureStats | null }>({ max: 64, ttl: 60 * 60 * 1000 })

const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

// Median/p75 of completed stints — how long titles usually last on a provider.
// Returns null under MIN_SAMPLES so callers suppress the claim until it's real.
export const MIN_TENURE_SAMPLES = 5

export async function getProviderTenureStats(providerKey: string, region: TenureRegion = 'US'): Promise<TenureStats | null> {
  const memoKey = `${region}:${providerKey}`
  const memoized = statsMemo.get(memoKey)
  if (memoized !== undefined) return memoized.v

  const kv = getRedis()
  let stats: TenureStats | null = null
  if (kv) {
    try {
      const records = await kv.hgetall<Record<string, ProviderTenureRecord>>(providerTenureKey(region, providerKey))
      const stays: number[] = []
      let oldest: string | null = null
      for (const r of Object.values(records || {})) {
        if (r?.on && r?.left) {
          const days = dayDiff(r.on, r.left)
          if (days >= 0) stays.push(days)
        }
        const seen = r?.on || r?.left
        if (seen && (!oldest || seen < oldest)) oldest = seen
      }
      if (stays.length >= MIN_TENURE_SAMPLES) {
        stays.sort((a, b) => a - b)
        const pick = (q: number) => stays[Math.min(stays.length - 1, Math.floor(q * stays.length))]!
        stats = { medianDays: pick(0.5), p75Days: pick(0.75), samples: stays.length, trackedSince: oldest }
      }
    } catch {}
  }
  statsMemo.set(memoKey, { v: stats })
  return stats
}
