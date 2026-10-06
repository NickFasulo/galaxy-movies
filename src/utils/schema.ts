import { SITE_URL, tmdbImage } from './site'
import type { MediaType, TitleSummary } from '../types/tmdb'

export function absoluteImageUrl(path: string, siteUrl: string): string {
  return path.startsWith('http') ? path : `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function personSchema(person: { id: number; name: string }, siteUrl: string) {
  return {
    '@type': 'Person',
    name: person.name,
    url: `${siteUrl}/person/${person.id}`
  }
}

export function aggregateRatingSchema(voteAverage: number | undefined, voteCount: number | undefined) {
  return (voteCount ?? 0) > 0
    ? {
        '@type': 'AggregateRating',
        ratingValue: voteAverage,
        ratingCount: voteCount,
        bestRating: 10,
        worstRating: 0
      }
    : undefined
}

export function buildOgImageUrl({
  siteUrl,
  title,
  subtitle,
  posterPath
}: {
  siteUrl: string
  title: string
  subtitle: string
  posterPath: string | null
}): string {
  return `${siteUrl}/api/og?${new URLSearchParams({
    title,
    subtitle,
    ...(posterPath ? { poster: tmdbImage(posterPath)! } : {})
  }).toString()}`
}

export function itemListSchema({ name, description, url, items, numberOfItems }: {
  name: string
  description?: string
  url: string
  items: Record<string, unknown>[]
  numberOfItems?: number
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    url,
    numberOfItems: numberOfItems ?? items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item
    }))
  }
}

export function titleItem(title: TitleSummary, media?: MediaType): Record<string, unknown> {
  const isTv = (media ?? title.mediaType) === 'tv'
  return {
    '@type': isTv ? 'TVSeries' : 'Movie',
    name: title.name || title.title,
    url: `${SITE_URL}/${isTv ? 'tv' : 'movies'}/${title.id}`,
    image: tmdbImage(title.poster_path),
    ...(isTv
      ? { startDate: title.first_air_date || title.release_date || undefined }
      : { datePublished: title.release_date || undefined })
  }
}

export function titleListSchema({ name, description, url, titles, media, limit = 10 }: {
  name: string
  description?: string
  url: string
  titles: TitleSummary[]
  media?: MediaType
  limit?: number
}) {
  return itemListSchema({
    name,
    description,
    url,
    numberOfItems: titles.length,
    items: titles.slice(0, limit).map((t) => titleItem(t, media))
  })
}

export function buildTrailerSchema({
  title,
  uploadDate,
  thumbnailUrl,
  videoKey
}: {
  title: string
  uploadDate?: string
  thumbnailUrl: string
  videoKey: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${title} Trailer`,
    description: `Watch the official trailer for ${title}`,
    inLanguage: 'en',
    thumbnailUrl,
    uploadDate: uploadDate ? `${uploadDate}T00:00:00Z` : undefined,
    contentUrl: `https://www.youtube.com/watch?v=${videoKey}`,
    embedUrl: `https://www.youtube.com/embed/${videoKey}`
  }
}
