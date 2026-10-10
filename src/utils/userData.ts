import { streamingProviders } from './tmdb'
import type { MediaType } from '../types/tmdb'

export interface WatchlistItem {
  id: number
  mediaType: MediaType
  title: string | undefined
  poster_path: string | null
  year: string | null
  added_at: string
}

export interface RatingEntry {
  rating: number
  title: string
  mediaType: MediaType
  id?: number
  poster_path?: string | null
  year?: string | null
}

export interface UserData {
  watchlist: WatchlistItem[]
  ratings: Record<string, RatingEntry>
  services: { region: string; providers: string[] }
}

export interface WatchlistableTitle {
  id: number
  mediaType?: MediaType
  title?: string
  name?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
}

const STORAGE_KEY = 'gm.userData.v1'

export const EMPTY_USER_DATA: UserData = {
  watchlist: [],
  ratings: {},
  services: { region: 'US', providers: [] }
}

// Parsed data is cached against the raw string so useSyncExternalStore gets a
// stable snapshot — a fresh object per read would loop forever.
let cache: { raw: string | null | undefined; data: UserData } = { raw: undefined, data: EMPTY_USER_DATA }

function normalize(raw: string | null): UserData {
  if (!raw) return EMPTY_USER_DATA
  try {
    const obj = JSON.parse(raw)
    return {
      watchlist: Array.isArray(obj.watchlist) ? obj.watchlist : [],
      ratings: obj.ratings && typeof obj.ratings === 'object' ? obj.ratings : {},
      services: {
        region: obj.services?.region || 'US',
        providers: Array.isArray(obj.services?.providers) ? obj.services.providers : []
      }
    }
  } catch {
    return EMPTY_USER_DATA
  }
}

// localStorage can throw on read AND write (private mode, disabled cookies,
// sandboxed iframes) — fall back to memory so the feature still works per-session.
let memoryFallback: string | null = null
let storageDisabled = false

function readRaw(): string | null {
  if (storageDisabled) return memoryFallback
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    storageDisabled = true
    return memoryFallback
  }
}

export function getUserData(): UserData {
  if (typeof window === 'undefined') return EMPTY_USER_DATA
  const raw = readRaw()
  if (raw === cache.raw) return cache.data
  const data = normalize(raw)
  cache = { raw, data }
  return data
}

export function getUserDataRaw(): string | null {
  if (typeof window === 'undefined') return null
  return readRaw()
}

const listeners = new Set<() => void>()
let storageListenerAttached = false

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  cache = { raw: undefined, data: EMPTY_USER_DATA }
  listeners.forEach((listener) => listener())
}

export function subscribeUserData(listener: () => void): () => void {
  listeners.add(listener)
  if (typeof window !== 'undefined' && !storageListenerAttached) {
    window.addEventListener('storage', handleStorageEvent)
    storageListenerAttached = true
  }
  return () => { listeners.delete(listener) }
}

function writeUserData(next: UserData) {
  const raw = JSON.stringify(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, raw)
  } catch {
    storageDisabled = true
    memoryFallback = raw
  }
  cache = { raw, data: next }
  listeners.forEach((listener) => listener())
}

function update(mutator: (data: UserData) => UserData) {
  if (typeof window === 'undefined') return
  writeUserData(mutator(getUserData()))
}

export function toggleWatchlist(movie: WatchlistableTitle): void {
  update((data) => {
    const mediaType = movie.mediaType || 'movie'
    const matches = (item: WatchlistItem) => item.id === movie.id && (item.mediaType || 'movie') === mediaType
    const exists = data.watchlist.some(matches)
    return {
      ...data,
      watchlist: exists
        ? data.watchlist.filter((item) => !matches(item))
        : [{
            id: movie.id,
            mediaType,
            title: movie.title || movie.name,
            poster_path: movie.poster_path || null,
            year: (movie.release_date || movie.first_air_date || '').slice(0, 4) || null,
            added_at: new Date().toISOString()
          }, ...data.watchlist]
    }
  })
}

export function isWatchlisted(id: number, data: UserData = getUserData(), mediaType: MediaType = 'movie'): boolean {
  return data.watchlist.some((item) => item.id === id && (item.mediaType || 'movie') === mediaType)
}

// Ratings are keyed 'tv:{id}' or bare id; newer entries also store the id on
// the value. Flatten both shapes so consumers always get a usable id.
export function ratingEntries(ratings: UserData['ratings']): (RatingEntry & { id: number })[] {
  return Object.entries(ratings).flatMap(([key, entry]) => {
    const tv = key.startsWith('tv:')
    const id = entry.id ?? Number(tv ? key.slice(3) : key)
    if (!Number.isFinite(id)) return []
    return [{ ...entry, id, mediaType: entry.mediaType || (tv ? 'tv' : 'movie') }]
  })
}

// rating is 1..10; null/undefined removes the rating.
// tv ratings are namespaced ('tv:{id}') since movie/tv ids overlap in TMDB.
export function setRating(movie: WatchlistableTitle, rating: number | null | undefined, mediaType: MediaType = 'movie'): void {
  update((data) => {
    const ratings = { ...data.ratings }
    const key = mediaType === 'tv' ? `tv:${movie.id}` : movie.id
    if (rating == null) delete ratings[key]
    else ratings[key] = {
      rating,
      title: movie.title || movie.name || '',
      mediaType,
      id: movie.id,
      poster_path: movie.poster_path || null,
      year: (movie.release_date || movie.first_air_date || '').slice(0, 4) || null
    }
    return { ...data, ratings }
  })
}

export function getRating(id: number, data: UserData = getUserData(), mediaType: MediaType = 'movie'): number | null {
  const key = mediaType === 'tv' ? `tv:${id}` : id
  return data.ratings[key]?.rating || null
}

export function setServices(region: string, providers: string[]): void {
  update((data) => ({ ...data, services: { region, providers } }))
}

export function buildTasteProfile(data: UserData = getUserData()) {
  const rated = Object.values(data.ratings)
  const topRated = rated
    .filter((r) => r.rating >= 7)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10)
    .map((r) => `${r.title} (${r.rating}/10)`)
  const disliked = rated
    .filter((r) => r.rating <= 4)
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 5)
    .map((r) => r.title)
  const watchlist = data.watchlist.slice(0, 15).map((m) => m.title)
  const services = data.services.providers
    .map((key) => streamingProviders[key]?.title?.replace(' Movies', ''))
    .filter((title): title is string => Boolean(title))
  return { topRated, disliked, watchlist, services }
}

// Shape of the snapshot stored server-side in gm:alerts:prefs — mirrors
// alertsSync's buildSnapshot. poster_path/year optional: older snapshots lack them.
export interface SyncedPrefs {
  watchlist?: { id: number; mediaType?: MediaType; title: string; poster_path?: string | null; year?: string | null }[]
  services?: string[]
  region?: string
  ratings?: { id: number; mediaType?: MediaType; title: string; rating: number; poster_path?: string | null; year?: string | null }[]
  updatedAt?: number
}

// Local wins every conflict (this device was used most recently) — there are
// no per-entry timestamps to do better. Server data only fills gaps.
export function mergePrefsIntoData(data: UserData, prefs: SyncedPrefs): UserData {
  const watchlist = [...data.watchlist]
  const seen = new Set(watchlist.map((item) => `${item.mediaType || 'movie'}:${item.id}`))
  for (const item of prefs.watchlist || []) {
    if (typeof item?.id !== 'number' || !item.title) continue
    const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie'
    const key = `${mediaType}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    watchlist.push({
      id: item.id,
      mediaType,
      title: item.title,
      poster_path: item.poster_path || null,
      year: item.year || null,
      added_at: new Date().toISOString()
    })
  }

  const ratings = { ...data.ratings }
  for (const r of prefs.ratings || []) {
    if (typeof r?.id !== 'number' || typeof r.rating !== 'number') continue
    const mediaType = r.mediaType === 'tv' ? 'tv' : 'movie'
    const key: string | number = mediaType === 'tv' ? `tv:${r.id}` : r.id
    if (key in ratings) continue
    ratings[key] = {
      rating: Math.min(10, Math.max(1, Math.round(r.rating))),
      title: r.title || '',
      mediaType,
      id: r.id,
      poster_path: r.poster_path || null,
      year: r.year || null
    }
  }

  // An untouched local services block (default region, no providers) adopts the
  // server's; anything the user changed locally stays.
  const services = data.services.providers.length === 0 && data.services.region === 'US' && prefs.region
    ? { region: prefs.region, providers: Array.isArray(prefs.services) ? prefs.services : [] }
    : data.services

  return { watchlist, ratings, services }
}

export function mergeSyncedPrefs(prefs: SyncedPrefs): void {
  update((data) => mergePrefsIntoData(data, prefs))
}

export interface RatingMetaPatch {
  id: number
  mediaType?: MediaType
  poster_path?: string | null
  year?: string | null
  title?: string
}

// Fills gaps on existing rating entries only — entries rated before the schema
// carried poster_path/year get patched by the watchlist backfill; newer fields
// never overwrite.
export function mergeRatingMetaIntoData(data: UserData, items: RatingMetaPatch[]): UserData {
  const ratings = { ...data.ratings }
  for (const item of items) {
    if (!Number.isInteger(item?.id) || item.id <= 0) continue
    const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie'
    const key: string | number = mediaType === 'tv' ? `tv:${item.id}` : item.id
    const entry = ratings[key]
    if (!entry) continue
    const needsPatch = (item.poster_path && !entry.poster_path) || (item.year && !entry.year) || (item.title && !entry.title)
    if (!needsPatch) continue
    ratings[key] = {
      ...entry,
      id: entry.id ?? item.id,
      poster_path: entry.poster_path ?? item.poster_path ?? null,
      year: entry.year ?? item.year ?? null,
      title: entry.title || item.title || ''
    }
  }
  return { ...data, ratings }
}

export function backfillRatingMeta(items: RatingMetaPatch[]): void {
  if (!items.length) return
  update((data) => mergeRatingMetaIntoData(data, items))
}
