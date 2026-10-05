import { movieGenres, tvGenres, streamingProviders } from './tmdb'

export const MIN_INDEXABLE_MOVIES = 8

export const providerGenreSlugs = [
  'action',
  'animation',
  'comedy',
  'documentary',
  'drama',
  'family',
  'horror',
  'romance',
  'science-fiction',
  'thriller'
]

export const tvProviderGenreSlugs = [
  'action-adventure',
  'animation',
  'comedy',
  'documentary',
  'drama',
  'family',
  'kids',
  'mystery',
  'reality',
  'sci-fi-fantasy'
]

export function getProviderLabel(providerKey) {
  return streamingProviders[providerKey]?.title?.replace(' Movies', '') || null
}

export function getProviderGenreTarget(providerKey, genreKey) {
  const provider = streamingProviders[providerKey]
  const genre = movieGenres[genreKey]

  if (!provider || !genre || !providerGenreSlugs.includes(genreKey)) {
    return null
  }

  const providerLabel = getProviderLabel(providerKey)
  const genreLabel = genre.title.replace(' Movies', '')

  return {
    providerKey,
    genreKey,
    providerLabel,
    genreLabel,
    title: `Best ${genreLabel} Movies on ${providerLabel}`,
    description: `Find highly watchable ${genreLabel.toLowerCase()} movies currently available on ${providerLabel}, refreshed as streaming catalogs change.`
  }
}

export function getProviderGenreTargets() {
  return Object.keys(streamingProviders).flatMap((providerKey) =>
    providerGenreSlugs
      .map((genreKey) => getProviderGenreTarget(providerKey, genreKey))
      .filter(Boolean)
  )
}

export function getTvProviderGenreTarget(providerKey, genreKey) {
  const provider = streamingProviders[providerKey]
  const genre = tvGenres[genreKey]

  if (!provider || !genre || !tvProviderGenreSlugs.includes(genreKey)) {
    return null
  }

  const providerLabel = getProviderLabel(providerKey)
  const genreLabel = genre.title.replace(' Shows', '')

  return {
    providerKey,
    genreKey,
    providerLabel,
    genreLabel,
    title: `Best ${genreLabel} Shows on ${providerLabel}`,
    description: `Find highly watchable ${genreLabel.toLowerCase()} shows currently streaming on ${providerLabel}, refreshed as streaming catalogs change.`
  }
}

export function getTvProviderGenreTargets() {
  return Object.keys(streamingProviders).flatMap((providerKey) =>
    tvProviderGenreSlugs
      .map((genreKey) => getTvProviderGenreTarget(providerKey, genreKey))
      .filter(Boolean)
  )
}

export function getContentIndexability({ movies = [], dataError = false }) {
  if (dataError) {
    return {
      isIndexable: false,
      reason: 'Movie data is temporarily unavailable.'
    }
  }

  if (movies.length < MIN_INDEXABLE_MOVIES) {
    return {
      isIndexable: false,
      reason: `Only ${movies.length} matching movies are available.`
    }
  }

  return { isIndexable: true, reason: null }
}
