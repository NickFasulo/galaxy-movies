export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'

export function tmdbImage(path: string | null | undefined, size = 'w500'): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined
}
