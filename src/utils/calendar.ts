import type { ProviderChanges } from './streamingChanges'
import type { AlertPrefs } from './watchlistAlerts'
import { SITE_URL } from './site'

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
