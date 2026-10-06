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
    ...(posterPath ? { poster: `https://image.tmdb.org/t/p/w500${posterPath}` } : {})
  }).toString()}`
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
