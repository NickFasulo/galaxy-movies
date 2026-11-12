import { parseCsv } from './importLetterboxd'
import type { MediaType } from '../../types/tmdb'

export interface ImdbItem {
  title: string
  year?: string
  imdbId?: string
  mediaType: MediaType
  rating?: number
  watchedAt?: string
  date?: string
}

const TV_TYPES = new Set(['tv series', 'tv mini-series', 'mini-series'])

// IMDb exports: Const,Your Rating,Date Rated,Title,URL,Title Type,...,Year,...
// (ratings.csv) or Const,Created,Modified,Description,Title,URL,Title Type,...
// (watchlist.csv / checkins.csv). 'Your Rating' is already 1-10; 'Const' is the
// tt id, which resolves exactly through TMDB's /find imdb_id lookup.
export function parseImdbCsv(text: string): ImdbItem[] {
  const rows = parseCsv(text.replace(/^﻿/, '').trim())
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  if (header[0] !== 'const') return []
  const col = (name: string) => header.indexOf(name)
  const titleCol = col('title')
  if (titleCol < 0) return []

  const typeCol = col('title type')
  const yearCol = col('year')
  const ratingCol = col('your rating')
  const ratedCol = col('date rated')
  const createdCol = col('created')

  const items: ImdbItem[] = []
  for (const r of rows.slice(1)) {
    const title = r[titleCol]?.trim()
    if (!title) continue
    const type = typeCol >= 0 ? r[typeCol]?.trim().toLowerCase() : ''
    if (type === 'video game') continue
    const item: ImdbItem = { title, mediaType: TV_TYPES.has(type) ? 'tv' : 'movie' }
    const imdbId = r[0]?.trim()
    if (imdbId && /^tt\d{5,10}$/.test(imdbId)) item.imdbId = imdbId
    const year = yearCol >= 0 ? r[yearCol]?.trim() : undefined
    if (year && /^\d{4}$/.test(year)) item.year = year
    const rating = ratingCol >= 0 ? Number(r[ratingCol]) : NaN
    if (Number.isInteger(rating) && rating >= 1 && rating <= 10) item.rating = rating
    const rated = ratedCol >= 0 ? r[ratedCol]?.slice(0, 10) : undefined
    if (rated && /^\d{4}-\d{2}-\d{2}$/.test(rated)) item.date = rated
    const created = createdCol >= 0 ? r[createdCol]?.slice(0, 10) : undefined
    if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) item.watchedAt = created
    items.push(item)
  }
  return items
}
