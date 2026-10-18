import { LRUCache } from 'lru-cache'
import type { ProviderChanges } from '../catalog/streamingChanges'
import type { AlertPrefs, EpisodeAir } from './watchlistAlerts'
import { fetchNextEpisode } from './watchlistAlerts'
import { fetchTmdb } from '../catalog/tmdb'
import { SITE_URL } from '../../lib/site'
import type { ReleaseDatesResponse } from '../../types/tmdb'

export interface CalendarEvent {
  uid: string
  date: string
  summary: string
  url: string
  stamp: number
}

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const DATE_STAMP = /^(\d{4})-?(\d{2})-?(\d{2})$/

export function toIcsDate(date: string, addDays = 0): string | null {
  const m = String(date || '').match(DATE_STAMP)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + addDays)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

function toIcsStamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

// 'coming' releases intersected with the watchlist — 'left' items carry no
// date, so there's nothing to put on a calendar for departures.
export function comingEvents(prefs: AlertPrefs, changes: Record<string, ProviderChanges>): CalendarEvent[] {
  const watchlistKeys = new Set(prefs.watchlist.map((w) => `${w.mediaType}:${w.id}`))
  const events: CalendarEvent[] = []

  for (const [providerKey, change] of Object.entries(changes)) {
    for (const item of change.coming || []) {
      if (!item.tmdbId || !item.date || !watchlistKeys.has(`${item.tmdbType}:${item.tmdbId}`)) continue
      events.push({
        uid: `${providerKey}:${item.tmdbType}:${item.tmdbId}@galaxymovies.app`,
        date: item.date,
        summary: `${item.title}${item.season ? ` season ${item.season}` : ''} comes to ${change.source}`,
        url: `${SITE_URL}/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`,
        stamp: change.updatedAt || Date.now()
      })
    }
  }
  return events
}

export function episodeEvents(prefs: AlertPrefs, episodes: Map<number, EpisodeAir>): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const w of prefs.watchlist) {
    if (w.mediaType !== 'tv') continue
    const ep = episodes.get(w.id)
    if (!ep?.airDate) continue
    const se = ep.season != null && ep.episode != null ? ` S${ep.season}E${ep.episode}` : ''
    events.push({
      uid: `episode:tv:${w.id}:${ep.airDate}@galaxymovies.app`,
      date: ep.airDate,
      summary: `${w.title}${se} airs`,
      url: `${SITE_URL}/tv/${w.id}`,
      stamp: Date.now()
    })
  }
  return events
}

export function premiereEvents(prefs: AlertPrefs, premieres: Map<number, string>): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const w of prefs.watchlist) {
    if (w.mediaType !== 'movie') continue
    const date = premieres.get(w.id)
    if (!date) continue
    events.push({
      uid: `premiere:movie:${w.id}@galaxymovies.app`,
      date,
      summary: `${w.title} premieres in theaters`,
      url: `${SITE_URL}/movies/${w.id}`,
      stamp: Date.now()
    })
  }
  return events
}

// Per-instance LRU so calendar-client polls don't refetch TMDB detail calls —
// the response itself is CDN-cached an hour, this covers process restarts and
// keeps cold fetches bounded by the caps in the loaders below.
const episodeLru = new LRUCache<number, { v: EpisodeAir | null }>({ max: 500, ttl: 1000 * 60 * 60 * 24 })
const premiereLru = new LRUCache<number, { v: string | null }>({ max: 500, ttl: 1000 * 60 * 60 * 24 })
const MAX_DETAIL_FETCHES = 25

export async function loadUpcomingEpisodes(ids: number[]): Promise<Map<number, EpisodeAir>> {
  const index = new Map<number, EpisodeAir>()
  const missing: number[] = []
  for (const id of ids) {
    const hit = episodeLru.get(id)
    if (hit) {
      if (hit.v) index.set(id, hit.v)
    } else {
      missing.push(id)
    }
  }
  await Promise.all(
    missing.slice(0, MAX_DETAIL_FETCHES).map(async (id) => {
      const ep = await fetchNextEpisode(id)
      episodeLru.set(id, { v: ep })
      if (ep) index.set(id, ep)
    })
  )
  return index
}

const todayStamp = () => new Date().toISOString().slice(0, 10)

// Theatrical premiere (type 3) preferred; falls back to the earliest future
// release of any type in the subscriber's region (US when absent).
async function upcomingPremiere(id: number, region: string): Promise<string | null> {
  try {
    const data = await fetchTmdb<ReleaseDatesResponse>(`/movie/${id}/release_dates`)
    const entries = data?.results || []
    const regional =
      entries.find((e) => e.iso_3166_1 === region) ||
      entries.find((e) => e.iso_3166_1 === 'US') ||
      entries[0]
    const today = todayStamp()
    const future = (regional?.release_dates || []).filter(
      (r): r is { certification?: string; type?: number; release_date: string } =>
        typeof r.release_date === 'string' && r.release_date.slice(0, 10) >= today
    )
    const pick = future.find((r) => r.type === 3) || future.sort((a, b) => a.release_date.localeCompare(b.release_date))[0]
    return pick ? pick.release_date.slice(0, 10) : null
  } catch {
    return null
  }
}

export async function loadUpcomingPremieres(ids: number[], region: string): Promise<Map<number, string>> {
  const index = new Map<number, string>()
  const missing: number[] = []
  for (const id of ids) {
    const hit = premiereLru.get(id)
    if (hit) {
      if (hit.v) index.set(id, hit.v)
    } else {
      missing.push(id)
    }
  }
  await Promise.all(
    missing.slice(0, MAX_DETAIL_FETCHES).map(async (id) => {
      const date = await upcomingPremiere(id, region)
      premiereLru.set(id, { v: date })
      if (date) index.set(id, date)
    })
  )
  return index
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Galaxy Movies//Watchlist Calendar//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Galaxy Movies watchlist'
  ]
  for (const e of events) {
    const start = toIcsDate(e.date)
    if (!start) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${toIcsStamp(e.stamp)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${toIcsDate(e.date, 1)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `URL:${e.url}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
