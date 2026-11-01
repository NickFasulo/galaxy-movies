import { streamingProviders } from '../catalog/tmdb'
import type { UserData } from '../../lib/userData'
import { ratingEntries } from '../../lib/userData'

// One side of a movie-night merge: local userData or a resolved share link
// produce the same shape so the merge doesn't care which it got.
export interface TasteSide {
  topRated: string[]
  disliked: string[]
  watchlist: string[]
  serviceKeys: string[]
}

export interface MergedTaste {
  topRated: string[]
  disliked: string[]
  watchlist: string[]
  services: string[]
  serviceKeys: string[]
  // Titles both people rated ≥7 — the strongest "bridge" signal the chat
  // prompt can get, so it gets its own slot.
  sharedLoved: string[]
}

// Accepts a bare shareId, a /list/{id} path, or a full URL — whatever a
// partner actually pastes.
export function parseShareInput(input: string): string | null {
  const trimmed = input.trim()
  const match = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return match ? match[1].toLowerCase() : null
}

const stripRating = (s: string) => s.replace(/\s*\(\d+(?:\.\d+)?\/10\)\s*$/, '').trim()

export function localTasteSide(data: UserData): TasteSide {
  const ratings = ratingEntries(data.ratings)
  return {
    topRated: ratings
      .filter((r) => r.rating >= 7)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10)
      .map((r) => `${r.title} (${r.rating}/10)`),
    disliked: ratings
      .filter((r) => r.rating <= 4)
      .sort((a, b) => a.rating - b.rating)
      .slice(0, 5)
      .map((r) => r.title)
      .filter((t): t is string => Boolean(t)),
    watchlist: data.watchlist.slice(0, 15).map((w) => w.title).filter((t): t is string => Boolean(t)),
    serviceKeys: data.services.providers
  }
}

export function mergeTaste(a: TasteSide, b: TasteSide): MergedTaste {
  const dedupe = (lists: string[][], cap: number) =>
    [...new Set(lists.flat())].slice(0, cap)

  // A service both people have is the only one a pick can actually stream on
  // tonight; when one side has none selected, the other's list stands in.
  const sharedKeys = a.serviceKeys.length && b.serviceKeys.length
    ? a.serviceKeys.filter((k) => b.serviceKeys.includes(k))
    : [...new Set([...a.serviceKeys, ...b.serviceKeys])]
  const serviceKeys = sharedKeys.length ? sharedKeys : [...new Set([...a.serviceKeys, ...b.serviceKeys])]

  const aTitles = new Set(a.topRated.map(stripRating))
  const sharedLoved = b.topRated.filter((t) => aTitles.has(stripRating(t))).slice(0, 5)

  return {
    topRated: dedupe([a.topRated, b.topRated], 12),
    disliked: dedupe([a.disliked, b.disliked], 6),
    watchlist: dedupe([a.watchlist, b.watchlist], 15),
    services: serviceKeys
      .map((key) => streamingProviders[key]?.title?.replace(' Movies', ''))
      .filter((t): t is string => Boolean(t))
      .slice(0, 8),
    serviceKeys,
    sharedLoved
  }
}

// The message carries the group intent; the merged profile carries the data.
// Kept short so it fits the chat endpoint's message cap with room to spare.
export function movieNightPrompt(merged: MergedTaste): string {
  const bridge = merged.sharedLoved.length
    ? ` We both loved ${merged.sharedLoved.map(stripRating).slice(0, 3).join(', ')}.`
    : ''
  return `Pick 3 movies we can both watch tonight on a service we share.${bridge}`
}
