import type { SyncedPrefs } from '../userData'

type CsvItem = NonNullable<SyncedPrefs['watchlist']>[number]
type CsvRating = NonNullable<SyncedPrefs['ratings']>[number]

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}

const moviesOnly = <T extends { mediaType?: string }>(items: T[] | undefined): T[] =>
  (items || []).filter((item) => (item.mediaType ?? 'movie') === 'movie')

// Letterboxd's importer matches exactly on the tmdbID column and accepts
// Rating10 on the same 1-10 scale we store. It's film-only, so tv entries are
// dropped — Trakt sync covers those.
export function letterboxdCsvs(prefs: SyncedPrefs): { ratings: string; watchlist: string } {
  const ratings = toCsv(
    ['tmdbID', 'Title', 'Year', 'Rating10'],
    moviesOnly(prefs.ratings).map((r: CsvRating) => [r.id, r.title, r.year ?? '', r.rating])
  )
  const watchlist = toCsv(
    ['tmdbID', 'Title', 'Year'],
    moviesOnly(prefs.watchlist).map((w: CsvItem) => [w.id, w.title, w.year ?? ''])
  )
  return { ratings, watchlist }
}
