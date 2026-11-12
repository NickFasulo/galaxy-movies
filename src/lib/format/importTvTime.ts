import { parseCsv } from './importLetterboxd'

export interface TvTimeItem {
  title: string
  year?: string
  tvdbId?: number
  mediaType: 'movie' | 'tv'
  rating?: number
}

export interface TvTimeParseResult {
  watchlist: TvTimeItem[]
  ratings: TvTimeItem[]
  // Watched-but-unrated titles have no home in GM's model (no seen log) —
  // reported so the UI can set expectations instead of silently dropping them.
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
  const watchedShowIds = new Set<number>()
  // uuid -> v1 movie row (ratings join); title -> item accumulation.
  const movieByUuid = new Map<string, Row>()
  const watchlistMovies = new Map<string, TvTimeItem>()
  const watchedMovies = new Map<string, TvTimeItem>()
  const ratingByUuid = new Map<string, TvTimeItem>()

  const markShow = (tvdbId: number, title: string | undefined, patch: { watchlist?: boolean; archived?: boolean }) => {
    const entry = shows.get(tvdbId) ?? { title: undefined, watchlist: false, archived: false }
    if (title) entry.title = title
    if (patch.watchlist) entry.watchlist = true
    if (patch.archived) entry.archived = true
    shows.set(tvdbId, entry)
  }

  for (const row of buckets.get('tracking-prod-records.csv') ?? []) {
    if (row.entity_type === 'episode') {
      if (row.type === 'watch') {
        const id = toInt(row.series_id)
        if (id != null) watchedShowIds.add(id)
      }
      continue
    }
    if (row.entity_type !== 'movie') continue
    if (row.uuid) movieByUuid.set(row.uuid, row)
    const title = movieTitle(row)
    if (!title) continue
    const item: TvTimeItem = { title, year: toYear(row.release_date), mediaType: 'movie' }
    if (row.type === 'towatch' || row.type === 'follow') watchlistMovies.set(title.toLowerCase(), item)
    else if (row.type === 'watch' || row.type === 'rewatch') watchedMovies.set(title.toLowerCase(), item)
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
    if (toInt(row.nb_episodes_seen)) watchedShowIds.add(id)
  }

  for (const row of buckets.get('tracking-prod-records-v2.csv') ?? []) {
    const key = row.key ?? ''
    if (key.startsWith('user-series-')) {
      const id = toInt(row.s_id)
      if (id == null) continue
      if (truthy(row.is_archived)) markShow(id, row.series_name, { archived: true })
      else if (truthy(row.is_for_later) || truthy(row.is_followed)) markShow(id, row.series_name, { watchlist: true })
    } else if (key.startsWith('watch-episode-') || key.startsWith('rewatch-episode-')) {
      const id = toInt(row.s_id)
      if (id != null) watchedShowIds.add(id)
    }
  }

  for (const name of EPISODE_FILES) {
    for (const row of buckets.get(name) ?? []) {
      const id = toInt(row.tv_show_id)
      if (id != null) watchedShowIds.add(id)
    }
  }

  // Ratings beat watchlist entries for the same title — a rated movie was watched.
  const ratings = [...ratingByUuid.values()]
  const ratedTitles = new Set(ratings.map((r) => r.title.toLowerCase()))
  const watchlist: TvTimeItem[] = []

  for (const [tvdbId, show] of shows) {
    if (!show.watchlist || show.archived || !show.title) continue
    watchlist.push({ title: show.title, tvdbId, mediaType: 'tv' })
  }
  for (const [key, item] of watchlistMovies) {
    if (!ratedTitles.has(key)) watchlist.push(item)
  }

  const skippedWatched =
    [...watchedMovies.keys()].filter((k) => !ratedTitles.has(k)).length +
    [...watchedShowIds].filter((id) => {
      const show = shows.get(id)
      return !show?.watchlist || show.archived
    }).length

  return { watchlist, ratings, skippedWatched, filesRead, filesIgnored }
}
