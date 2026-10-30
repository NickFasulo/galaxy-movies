import type { MediaType } from '../types/tmdb'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.galaxymovies.app'

export function titlePath(tmdbType: MediaType, tmdbId: number): string {
  return `/${tmdbType === 'tv' ? 'tv' : 'movies'}/${tmdbId}`
}

export interface SocialProfile {
  name: string
  href: string
  // rel="me" is how Mastodon verifies the linked site back-reference.
  relMe?: boolean
}

export const SOCIAL_PROFILES: SocialProfile[] = [
  { name: 'Facebook', href: 'https://www.facebook.com/GalaxyMoviesApp' },
  { name: 'Bluesky', href: 'https://bsky.app/profile/galaxymovies.app' },
  { name: 'Mastodon', href: 'https://mastodon.social/@galaxymovies', relMe: true },
  { name: 'Reddit', href: 'https://www.reddit.com/r/GalaxyMovies' },
  { name: 'Telegram', href: 'https://t.me/galaxymoviesapp' },
  { name: 'Discord', href: 'https://discord.gg/jC8C89KDk' }
]

export function tmdbImage(path: string | null | undefined, size = 'w500'): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined
}
