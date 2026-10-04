import { streamingProviders } from './tmdb'

const STORAGE_KEY = 'gm.userData.v1'

export const EMPTY_USER_DATA = {
  watchlist: [],
  ratings: {},
  services: { region: 'US', providers: [] }
}

// Parsed data is cached against the raw string so useSyncExternalStore gets a
// stable snapshot — a fresh object per read would loop forever.
let cache = { raw: undefined, data: EMPTY_USER_DATA }

function normalize(raw) {
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
let memoryFallback = null
let storageDisabled = false

function readRaw() {
  if (storageDisabled) return memoryFallback
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    storageDisabled = true
    return memoryFallback
  }
}

export function getUserData() {
  if (typeof window === 'undefined') return EMPTY_USER_DATA
  const raw = readRaw()
  if (raw === cache.raw) return cache.data
  const data = normalize(raw)
  cache = { raw, data }
  return data
}

export function getUserDataRaw() {
  if (typeof window === 'undefined') return null
  return readRaw()
}

const listeners = new Set()
let storageListenerAttached = false

function handleStorageEvent(event) {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  cache = { raw: undefined, data: EMPTY_USER_DATA }
  listeners.forEach((listener) => listener())
}

export function subscribeUserData(listener) {
  listeners.add(listener)
  if (typeof window !== 'undefined' && !storageListenerAttached) {
    window.addEventListener('storage', handleStorageEvent)
    storageListenerAttached = true
  }
  return () => listeners.delete(listener)
}

function writeUserData(next) {
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

function update(mutator) {
  if (typeof window === 'undefined') return
  writeUserData(mutator(getUserData()))
}

export function toggleWatchlist(movie) {
  update((data) => {
    const mediaType = movie.mediaType || 'movie'
    const matches = (item) => item.id === movie.id && (item.mediaType || 'movie') === mediaType
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

export function isWatchlisted(id, data = getUserData(), mediaType = 'movie') {
  return data.watchlist.some((item) => item.id === id && (item.mediaType || 'movie') === mediaType)
}

// rating is 1..10; null/undefined removes the rating.
// tv ratings are namespaced ('tv:{id}') since movie/tv ids overlap in TMDB.
export function setRating(id, rating, title, mediaType = 'movie') {
  update((data) => {
    const ratings = { ...data.ratings }
    const key = mediaType === 'tv' ? `tv:${id}` : id
    if (rating == null) delete ratings[key]
    else ratings[key] = { rating, title, mediaType }
    return { ...data, ratings }
  })
}

export function getRating(id, data = getUserData(), mediaType = 'movie') {
  const key = mediaType === 'tv' ? `tv:${id}` : id
  return data.ratings[key]?.rating || null
}

export function setServices(region, providers) {
  update((data) => ({ ...data, services: { region, providers } }))
}

export function buildTasteProfile(data = getUserData()) {
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
    .filter(Boolean)
  return { topRated, disliked, watchlist, services }
}
