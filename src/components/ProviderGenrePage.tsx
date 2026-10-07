import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import PageHead from './PageHead'
import PageShell from './PageShell'
import {
  fetchDiscoverMovies,
  fetchDiscoverTv,
  getProviderId,
  isProviderAvailableInRegion,
  movieGenres,
  tvGenres,
  streamingProviders,
  type DiscoverOptions,
  type GenreDef
} from '../utils/tmdb'
import { detectRegion, regionDisplayName, regionListDisplayNames } from '../utils/region'
import { getContentIndexability, getProviderGenreTarget, getTvProviderGenreTarget, type ProviderGenreTarget } from '../utils/contentOpportunities'
import { setSwrCache } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../types/tmdb'

interface MediaConfig {
  discover: (options: DiscoverOptions) => Promise<TmdbPaged<TitleSummary>>
  genres: Record<string, GenreDef>
  basePath: string
  genreBasePath: string
  crumbRoot: { name: string; path: string }
  noun: string
  plural: string
  itemWord: string
  genreTarget: (provider: string, genre: string) => ProviderGenreTarget | null
}

const CONFIG: Record<MediaType, MediaConfig> = {
  movie: {
    discover: fetchDiscoverMovies,
    genres: movieGenres,
    basePath: '/streaming',
    genreBasePath: '/genre',
    crumbRoot: { name: 'Streaming', path: '/streaming' },
    noun: 'Movie',
    plural: 'movies',
    itemWord: 'movie',
    genreTarget: getProviderGenreTarget
  },
  tv: {
    discover: fetchDiscoverTv,
    genres: tvGenres,
    basePath: '/tv/streaming',
    genreBasePath: '/tv/genre',
    crumbRoot: { name: 'TV Shows', path: '/tv' },
    noun: 'Show',
    plural: 'shows',
    itemWord: 'show',
    genreTarget: getTvProviderGenreTarget
  }
}

export interface ProviderGenrePageProps {
  media: MediaType
  provider: string
  genre: string
  target: ProviderGenreTarget
  titles: TitleSummary[]
  dataError?: boolean
  region: string
  availableInRegion: boolean
  isIndexable: boolean
  indexabilityReason: string | null
}

export function providerGenreServerSideProps(media: MediaType) {
  const { discover, genres, genreTarget } = CONFIG[media]

  return async function getServerSideProps({ params, req, res }: GetServerSidePropsContext<{ provider: string; genre: string }>): Promise<GetServerSidePropsResult<ProviderGenrePageProps>> {
    const providerSlug = params?.provider ?? ''
    const genreSlug = params?.genre ?? ''
    const target = genreTarget(providerSlug, genreSlug)
    if (!target) return { notFound: true }

    const region = detectRegion(req)
    const providerId = getProviderId(providerSlug, region)
    const genreId = genres[genreSlug].id
    const availableInRegion = isProviderAvailableInRegion(providerSlug, region)

    const base = {
      media,
      provider: providerSlug,
      genre: genreSlug,
      target,
      region,
      availableInRegion
    }

    try {
      const data = await discover({ providerId, genreId, region })
      const titles = data.results || []
      const indexability = getContentIndexability({ movies: titles })

      setSwrCache(res)
      return {
        props: {
          ...base,
          titles,
          isIndexable: indexability.isIndexable,
          indexabilityReason: indexability.reason
        }
      }
    } catch (error) {
      console.error(error)
      const indexability = getContentIndexability({ dataError: true })

      res.statusCode = 502
      return {
        props: {
          ...base,
          titles: [],
          dataError: true,
          isIndexable: indexability.isIndexable,
          indexabilityReason: indexability.reason
        }
      }
    }
  }
}

export default function ProviderGenrePage({
  media,
  provider,
  genre,
  target,
  titles,
  dataError,
  region,
  availableInRegion,
  isIndexable,
  indexabilityReason
}: ProviderGenrePageProps) {
  const { basePath, genreBasePath, crumbRoot, noun, plural, itemWord } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${provider}/${genre}`
  const regionName = regionDisplayName(region)
  const homeRegionNames = regionListDisplayNames(streamingProviders[provider]?.regions)
  const description = availableInRegion
    ? `${target.description} Results are tuned for ${regionName}.`
    : `${target.description} ${target.providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`

  return (
    <>
      <PageHead
        title={target.title}
        description={description}
        canonicalUrl={canonicalUrl}
        noindex={!isIndexable}
        posterPath={titles[0]?.poster_path}
        structuredData={titleListSchema({ name: target.title, description, url: canonicalUrl, titles, media })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: crumbRoot.name, url: `${SITE_URL}${crumbRoot.path}` },
          { name: target.providerLabel, url: `${SITE_URL}${basePath}/${provider}` },
          { name: target.genreLabel, url: canonicalUrl }
        ]}
      />
      <PageShell title={target.title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.500' fontSize='sm'>
          Browse all{' '}
          <Link href={`${basePath}/${provider}`} style={{ textDecoration: 'underline' }}>{target.providerLabel} {plural}</Link>
          {' '}or all{' '}
          <Link href={`${genreBasePath}/${genre}`} style={{ textDecoration: 'underline' }}>{target.genreLabel.toLowerCase()} {plural}</Link>.
        </Text>

        {dataError ? (
          <Text mt={10}>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : titles.length === 0 ? (
          <Text mt={10} color='gray.500'>No {plural} currently match this streaming collection.</Text>
        ) : (
          <MovieGrid movies={titles} />
        )}

        {!isIndexable && indexabilityReason && (
          <Text textAlign='center' mt={8} color='gray.500' fontSize='sm'>
            This page is available for browsing but held out of search indexing for now: {indexabilityReason}
          </Text>
        )}
        <Text textAlign='center' mt={8} color='gray.400'>
          Availability changes by region and over time. Check the {itemWord} page for current provider information.
        </Text>
      </PageShell>
    </>
  );
}
