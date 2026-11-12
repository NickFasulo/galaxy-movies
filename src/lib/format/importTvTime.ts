import { parseCsv } from './importLetterboxd'

export interface TvTimeItem {
  title: string
  year?: string
  tvdbId?: number
  mediaType: 'movie' | 'tv'
  rating?: number
  watchedAt?: string
  episodes?: number
  lastEpisode?: string
}

export interface TvTimeParseResult {
  watchlist: TvTimeItem[]
  ratings: TvTimeItem[]
  watched: TvTimeItem[]
  // Rows that produced no item (missing title/id) — reported so the UI can
  // set expectations instead of silently dropping them.
  skippedWatched: number
  filesRead: string[]
  filesIgnored: number
}

interface CsvFile {
  name: string
  text: string
}

type Row = Record<string, string>

// TV Time's stars_wording_scalev2 set — the trailing id in each vote_key.
// Doubled positions are already a 1–10 score; verified against Trakt's
// importer (trakt-web TvTimeGdprParser), which mapped them from
// msapi.tvtime.com/live/v1/ratings/sets before the shutdown froze the set.
const RATING_ID_TO_SCORE: Record<number, number> = { 1: 2, 27: 4, 28: 6, 29: 8, 3: 10 }

const baseName = (name: string) => name.replace(/\\/g, '/').split('/').pop()!.toLowerCase()

function toRows(text: string): Row[] {
  const rows = parseCsv(text.replace(/^﻿/, '').trim())
  if (!rows.length) return []
  const headers = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
}

const truthy = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'true'
const toInt = (v: string | undefined) => {
  const n = Number(v)
  return Number.isInteger(n) ? n : undefined
}

// TV Time stores unknown dates as the Go zero time.
function toYear(releaseDate: string | undefined): string | undefined {
  const year = releaseDate?.slice(0, 4)
  return year && Number(year) >= 1888 ? year : undefined
}

// Dates arrive as 'YYYY-MM-DD' (watch_date), 'YYYY-MM-DD HH:MM:SS' (created_at),
// or an epoch seconds suffix in watch_date_range_key. Day precision is all a
// diary needs.
function toDate(row: Row): string | undefined {
  const direct = row.watch_date?.slice(0, 10) || row.created_at?.slice(0, 10)
  if (direct && /^\d{4}-\d{2}-\d{2}$/.test(direct) && Number(direct.slice(0, 4)) >= 1888) return direct
  const epoch = Number(row.watch_date_range_key?.replace('watch-date-', ''))
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000).toISOString().slice(0, 10)
  return undefined
}

// Movie titles may be localized; the alpha_range_key slug
// (`{type}-alpha-{english-slug}`) is always English and resolves better.
function movieTitle(row: Row): string | undefined {
  const slug = row.alpha_range_key?.split('-alpha-')[1]?.replaceAll('-', ' ').trim()
  return slug || row.movie_name?.trim() || undefined
}

const EPISODE_FILES = new Set(['seen_episode_latest.csv', 'watched_on_episode.csv', 'rewatched_episode.csv'])

export function parseTvTimeCsvs(files: CsvFile[]): TvTimeParseResult {
  // Bucket first: the ratings join needs v1 movie rows regardless of the
  // order the files were selected in.
  const buckets = new Map<string, Row[]>()
  const filesRead: string[] = []
  let filesIgnored = 0

  for (const file of files) {
    const name = baseName(file.name)
    if (
      name === 'followed_tv_show.csv' ||
      name === 'user_tv_show_data.csv' ||
      name === 'tracking-prod-records.csv' ||
      name === 'tracking-prod-records-v2.csv' ||
      name === 'ratings-live-votes.csv' ||
      EPISODE_FILES.has(name)
    ) {
      const rows = toRows(file.text)
      if (rows.length) {
        buckets.set(name, rows)
        filesRead.push(name)
      } else {
        filesIgnored++
      }
    } else {
      filesIgnored++
    }
  }

  // Show state: tvdb id -> {title, watchlist, archived}
  const shows = new Map<number, { title?: string; watchlist: boolean; archived: boolean }>()
  // Episode watches roll up per show: count, latest date, and the S/E of the
  // most recent row for a 'last S2E10' tag. declaredSeen is user_tv_show_data's
  // nb_episodes_seen fallback when episode-level rows are absent.
  const watchedShows = new Map<number, { title?: string; count: number; declaredSeen?: number; maxDate?: string; lastEp?: { s: number; e: number } }>()
  const movieByUuid = new Map<string, Row>()
  const watchlistMovies = new Map<string, TvTimeItem>()
  const watchedMovies = new Map<string, TvTimeItem>()
  const ratingByUuid = new Map<string, TvTimeItem>()
  let skippedWatched = 0

  const markShow = (tvdbId: number, title: string | undefined, patch: { watchlist?: boolean; archived?: boolean }) => {
    const entry = shows.get(tvdbId) ?? { title: undefined, watchlist: false, archived: false }
    if (title) entry.title = title
    if (patch.watchlist) entry.watchlist = true
    if (patch.archived) entry.archived = true
    shows.set(tvdbId, entry)
  }

  const noteEpisodeWatch = (id: number | undefined, title: string | undefined, date: string | undefined, s?: number, e?: number) => {
    if (id == null) {
      skippedWatched++
      return
    }
    const w = watchedShows.get(id) ?? { count: 0 }
    w.count++
    if (title?.trim()) w.title = title.trim()
    if (date && (!w.maxDate || date >= w.maxDate)) {
      w.maxDate = date
      if (s != null && e != null) w.lastEp = { s, e }
    }
    watchedShows.set(id, w)
  }

  for (const row of buckets.get('tracking-prod-records.csv') ?? []) {
    if (row.entity_type === 'episode') {
      if (row.type === 'watch' || row.type === 'rewatch') {
        noteEpisodeWatch(toInt(row.series_id), row.series_name, toDate(row), toInt(row.season_number), toInt(row.episode_number))
      }
      continue
    }
    if (row.entity_type !== 'movie') continue
    if (row.uuid) movieByUuid.set(row.uuid, row)
    const title = movieTitle(row)
    if (!title) {
      if (row.type === 'watch' || row.type === 'rewatch') skippedWatched++
      continue
    }
    if (row.type === 'towatch' || row.type === 'follow') {
      watchlistMovies.set(title.toLowerCase(), { title, year: toYear(row.release_date), mediaType: 'movie' })
    } else if (row.type === 'watch' || row.type === 'rewatch') {
      // Same title + same day = one watch; a different day is a rewatch.
      const date = toDate(row)
      watchedMovies.set(`${title.toLowerCase()}|${date ?? ''}`, { title, year: toYear(row.release_date), mediaType: 'movie', watchedAt: date })
    }
  }

  for (const row of buckets.get('ratings-live-votes.csv') ?? []) {
    if (!row.uuid || (row.episode_id && row.episode_id !== '0')) continue
    const rating = RATING_ID_TO_SCORE[toInt(row.vote_key?.split('-').at(-1)) ?? -1]
    if (rating == null) continue
    const tracked = movieByUuid.get(row.uuid)
    const title = tracked ? movieTitle(tracked) : row.movie_name?.trim()
    if (!title) continue
    ratingByUuid.set(row.uuid, { title, year: toYear(tracked?.release_date), mediaType: 'movie', rating })
  }

  for (const row of buckets.get('followed_tv_show.csv') ?? []) {
    const id = toInt(row.tv_show_id)
    if (id == null) continue
    if (truthy(row.archived)) markShow(id, row.tv_show_name, { archived: true })
    else markShow(id, row.tv_show_name, { watchlist: true })
  }

  for (const row of buckets.get('user_tv_show_data.csv') ?? []) {
    const id = toInt(row.tv_show_id)
    if (id == null) continue
    if (truthy(row.is_followed)) markShow(id, row.tv_show_name, { watchlist: true })
    else markShow(id, row.tv_show_name, {})
    const seen = toInt(row.nb_episodes_seen)
    if (seen) {
      const w = watchedShows.get(id) ?? { count: 0 }
      if (row.tv_show_name?.trim()) w.title = row.tv_show_name.trim()
      w.declaredSeen = Math.max(w.declaredSeen ?? 0, seen)
      watchedShows.set(id, w)
    }
  }

  for (const row of buckets.get('tracking-prod-records-v2.csv') ?? []) {
    const key = row.key ?? ''
    if (key.startsWith('user-series-')) {
      const id = toInt(row.s_id)
      if (id == null) continue
      if (truthy(row.is_archived)) markShow(id, row.series_name, { archived: true })
      else if (truthy(row.is_for_later) || truthy(row.is_followed)) markShow(id, row.series_name, { watchlist: true })
    } else if (key.startsWith('watch-episode-') || key.startsWith('rewatch-episode-')) {
      noteEpisodeWatch(toInt(row.s_id), row.series_name, toDate(row), toInt(row.s_no), toInt(row.ep_no))
    }
  }

  for (const name of EPISODE_FILES) {
    for (const row of buckets.get(name) ?? []) {
      noteEpisodeWatch(toInt(row.tv_show_id), row.tv_show_name, toDate(row), toInt(row.episode_season_number), toInt(row.episode_number))
    }
  }

  const ratings = [...ratingByUuid.values()]

  const watched: TvTimeItem[] = [...watchedMovies.values()]
  for (const [tvdbId, w] of watchedShows) {
    const title = w.title ?? shows.get(tvdbId)?.title
    if (!title) {
      skippedWatched++
      continue
    }
    watched.push({
      title,
      tvdbId,
      mediaType: 'tv',
      watchedAt: w.maxDate,
      episodes: w.count || w.declaredSeen,
      lastEpisode: w.lastEp ? `S${w.lastEp.s}E${w.lastEp.e}` : undefined
    })
  }

  // A watched or rated title doesn't belong on the to-watch list — the same
  // semantics mark-watched applies in-app. Shows keep their spot: episodes
  // watched doesn't mean the series is finished.
  const doneTitles = new Set([...watched, ...ratings].map((w) => w.title.toLowerCase()))
  const watchlist: TvTimeItem[] = []

  for (const [tvdbId, show] of shows) {
    if (!show.watchlist || show.archived || !show.title) continue
    watchlist.push({ title: show.title, tvdbId, mediaType: 'tv' })
  }
  for (const [key, item] of watchlistMovies) {
    if (!doneTitles.has(key)) watchlist.push(item)
  }

  return { watchlist, ratings, watched, skippedWatched, filesRead, filesIgnored }
}
