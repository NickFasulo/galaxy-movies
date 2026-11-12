import type { ProductionCompany, ReleaseDatesResponse } from '../../types/tmdb'
import { usDigitalDate } from './digitalReleases'
import { dateFormatter, monthYearFormatter } from '../../lib/format/formatters'

// "When does X come to streaming" is a durable pre-release query family, so
// unreleased pages need a real answer: the confirmed US digital date when
// TMDB release_dates lists one (type 4), else a window estimated from the
// US theatrical date plus the distributor's usual theater-to-PVOD lag.
export interface StreamingEstimate {
  digitalDate: string | null
  anchor: string
  low: string | null
  high: string | null
  studio: string | null
}

// Ordered: first matching production company wins, so the distributor
// pattern must come before a co-producer's. Days are theatrical→digital,
// matching what each studio has actually done post-2021 windowing.
const STUDIO_LAGS: { match: RegExp; label: string; lowDays: number; highDays: number }[] = [
  { match: /universal|focus features|illumination|dreamworks|blumhouse/i, label: 'Universal', lowDays: 17, highDays: 35 },
  { match: /netflix/i, label: 'Netflix', lowDays: 14, highDays: 30 },
  { match: /lionsgate|summit entertainment|millennium|roadside attractions/i, label: 'Lionsgate', lowDays: 30, highDays: 46 },
  { match: /paramount/i, label: 'Paramount', lowDays: 30, highDays: 46 },
  { match: /amazon|mgm|metro-goldwyn|orion pictures/i, label: 'Amazon MGM', lowDays: 30, highDays: 60 },
  { match: /apple/i, label: 'Apple', lowDays: 40, highDays: 60 },
  { match: /warner|new line|dc studios|legendary/i, label: 'Warner Bros.', lowDays: 45, highDays: 70 },
  { match: /columbia|sony pictures|screen gems|tristar|3000 pictures|affirm/i, label: 'Sony', lowDays: 45, highDays: 75 },
  { match: /neon/i, label: 'Neon', lowDays: 45, highDays: 75 },
  { match: /\ba24\b/i, label: 'A24', lowDays: 45, highDays: 90 },
  { match: /walt disney|pixar|marvel|lucasfilm|20th century|searchlight|disneynature|regency/i, label: 'Disney', lowDays: 60, highDays: 100 }
]

// Industry-median window when no distributor pattern matches.
const GENERIC_LAG = { lowDays: 45, highDays: 90 }

// Earliest US theatrical date across premiere/limited/wide — the window
// starts at first domestic exhibition, whatever form it took.
function usTheatricalDate(dates: ReleaseDatesResponse | null): string | null {
  const found = (dates?.results || [])
    .filter((r) => r.iso_3166_1 === 'US')
    .flatMap((r) => r.release_dates || [])
    .filter((r) => r.type != null && r.type >= 1 && r.type <= 3 && typeof r.release_date === 'string' && r.release_date.length >= 10)
    .map((r) => (r.release_date as string).slice(0, 10))
    .sort()
  return found[0] || null
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function estimateDigitalWindow(input: {
  releaseDates: ReleaseDatesResponse | null
  companies?: ProductionCompany[]
  primaryDate?: string | null
  today: string
}): StreamingEstimate | null {
  const anchor = usTheatricalDate(input.releaseDates) || input.primaryDate || null
  if (!anchor) return null

  const digitalDate = usDigitalDate(input.releaseDates)
  if (digitalDate) return { digitalDate, anchor, low: null, high: null, studio: null }

  const studios = (input.companies || [])
    .map((c) => STUDIO_LAGS.find((lag) => lag.match.test(c.name || '')))
    .filter((c): c is (typeof STUDIO_LAGS)[number] => Boolean(c))
  const lag = studios[0] || GENERIC_LAG
  const high = addDays(anchor, lag.highDays)

  // A window fully in the past means the estimate already failed — the empty
  // state's generic copy is the honest answer then.
  if (high < input.today) return null

  return {
    digitalDate: null,
    anchor,
    low: addDays(anchor, lag.lowDays),
    high,
    studio: studios[0]?.label || null
  }
}

export interface EstimateCopy {
  // Panel line answering "when does it stream" in the Where to Watch box.
  line: string
  // Lowercase clause for the meta description, or null when there's no
  // forward-looking claim (digital already passed).
  tail: string | null
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

// Built server-side once per request so the rendered sentence is identical
// for SSR and hydration — never compute tense off the client's clock.
export function describeEstimate(e: StreamingEstimate, today: string): EstimateCopy {
  if (e.digitalDate) {
    const d = dateFormatter(e.digitalDate)
    return e.digitalDate > today
      ? { line: `Digital release ${d}.`, tail: `digital release ${d}` }
      : { line: `Went digital ${d} — not on a subscription service yet.`, tail: null }
  }
  if (!e.low || !e.high) return { line: '', tail: null }
  const weeks = `${Math.max(1, Math.round(dayDiff(e.anchor, e.low) / 7))}–${Math.round(dayDiff(e.anchor, e.high) / 7)} weeks`
  const when = `around ${monthYearFormatter(e.high)}`
  const lead = e.anchor > today ? `In theaters ${dateFormatter(e.anchor)} — ` : 'In theaters — '
  return {
    line: `${lead}${e.studio ? `${e.studio} films` : 'most films'} typically go digital ${weeks} after release, so ${when}.`,
    tail: `expected on digital ${when}`
  }
}
