import { getRedis } from '../../lib/redis'
import { fetchTmdb } from './tmdb'
import type { ReleaseDatesResponse, TmdbMovie, TmdbPaged } from '../../types/tmdb'

// TMDB discover's `with_release_type=4` flags titles that *have* a digital
// release anywhere; the per-title /release_dates call is what confirms the
// US date is actually type 4 (digital) rather than theatrical/premiere.
const LOOKBACK_DAYS = 60
const LOOKAHEAD_DAYS = 30
const MAX_DISCOVER_PAGES = 15
const VERIFY_CHUNK = 8
const MONTH_TTL_SECONDS = 60 * 60 * 24 * 300

export interface DigitalRelease {
  id: number
  title: string
  date: string
  poster: string | null
  pop: number
  upd: number
}

export interface DigitalReleaseDay {
  date: string
  releases: DigitalRelease[]
}

const monthKey = (date: string) => `digital:movie:${date.slice(0, 7)}`

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (base: Date, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function usDigitalDate(dates: ReleaseDatesResponse | null): string | null {
  const digital = (dates?.results || [])
    .filter((r) => r.iso_3166_1 === 'US')
    .flatMap((r) => r.release_dates || [])
    .filter((r) => r.type === 4 && typeof r.release_date === 'string' && r.release_date.length >= 10)
    .map((r) => (r.release_date as string).slice(0, 10))
    .sort()
  return digital[0] || null
}

export async function updateDigitalReleases(): Promise<{ scanned: number; confirmed: number; months: number }> {
  const kv = getRedis()
  if (!kv) return { scanned: 0, confirmed: 0, months: 0 }

  const now = new Date()
  const gte = isoDay(addDays(now, -LOOKBACK_DAYS))
  const lte = isoDay(addDays(now, LOOKAHEAD_DAYS))

  const found = new Map<number, { title: string; poster: string | null; pop: number }>()
  for (let page = 1; page <= MAX_DISCOVER_PAGES; page++) {
    const data = await fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', {
      include_adult: 'false',
      sort_by: 'popularity.desc',
      region: 'US',
      with_release_type: '4',
      'release_date.gte': gte,
      'release_date.lte': lte,
      page
    }).catch(() => null)
    if (!data?.results?.length) break
    for (const m of data.results) {
      if (m?.id && m.title) {
        found.set(m.id, { title: m.title, poster: m.poster_path || null, pop: m.popularity || 0 })
      }
    }
    if (data.results.length < 20 || (data.total_pages && page >= data.total_pages)) break
  }

  const ids = [...found.keys()]
  const byMonth = new Map<string, Record<string, DigitalRelease>>()
  for (let i = 0; i < ids.length; i += VERIFY_CHUNK) {
    await Promise.all(
      ids.slice(i, i + VERIFY_CHUNK).map(async (id) => {
        const dates = await fetchTmdb<ReleaseDatesResponse>(`/movie/${id}/release_dates`).catch(() => null)
        const date = usDigitalDate(dates)
        const meta = found.get(id)
        if (!date || !meta) return
        const release: DigitalRelease = { id, title: meta.title, date, poster: meta.poster, pop: meta.pop, upd: Date.now() }
        const key = monthKey(date)
        const bucket = byMonth.get(key) || {}
        bucket[String(id)] = release
        byMonth.set(key, bucket)
      })
    )
  }

  for (const [key, fields] of byMonth) {
    try {
      await kv.hset(key, fields as Record<string, unknown>)
      await kv.expire(key, MONTH_TTL_SECONDS)
    } catch (error) {
      console.error(`digital release write failed for ${key}:`, error)
    }
  }

  const confirmed = [...byMonth.values()].reduce((n, bucket) => n + Object.keys(bucket).length, 0)
  return { scanned: ids.length, confirmed, months: byMonth.size }
}

export async function getDigitalReleases(from?: string, to?: string): Promise<DigitalReleaseDay[]> {
  const kv = getRedis()
  if (!kv) return []

  const now = new Date()
  const start = from || isoDay(addDays(now, -14))
  const end = to || isoDay(addDays(now, 45))
  const months: string[] = []
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`)
  while (isoDay(cursor) <= end) {
    months.push(isoDay(cursor).slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const hashes = await Promise.all(
    months.map((m) => kv.hgetall<Record<string, DigitalRelease | string>>(`digital:movie:${m}`).catch(() => null))
  )

  // The same title can sit in two month keys when its date moved between runs —
  // keep the copy with the newest write.
  const byId = new Map<number, DigitalRelease>()
  for (const hash of hashes) {
    if (!hash) continue
    for (const raw of Object.values(hash)) {
      const release = typeof raw === 'string' ? (JSON.parse(raw) as DigitalRelease) : raw
      if (!release?.id || !release.date) continue
      const prior = byId.get(release.id)
      if (!prior || (release.upd || 0) >= (prior.upd || 0)) byId.set(release.id, release)
    }
  }

  const days = new Map<string, DigitalRelease[]>()
  for (const release of byId.values()) {
    if (release.date < start || release.date > end) continue
    const bucket = days.get(release.date) || []
    bucket.push(release)
    days.set(release.date, bucket)
  }

  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, releases]) => ({ date, releases: releases.sort((a, b) => b.pop - a.pop) }))
}
