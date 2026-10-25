import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Text } from '@chakra-ui/react'
import PaginatedGrid from './PaginatedGrid'
import PageHead from '../../../components/PageHead'
import PageShell from '../../../components/PageShell'
import {
  fetchDiscoverMovies,
  fetchDiscoverTv,
  getProviderIds,
  isProviderAvailableInRegion,
  movieGenres,
  tvGenres,
  streamingProviders,
  type DiscoverOptions,
  type GenreDef
} from '../tmdb'
import { detectRegion, regionDisplayName, regionListDisplayNames } from '../../../lib/region'
import { getContentIndexability, getProviderGenreTarget, getTvProviderGenreTarget, type ProviderGenreTarget } from '../contentOpportunities'
import { setSwrCache, getPageParam } from '../../../lib/http'
import { titleListSchema } from '../schema'
import { SITE_URL } from '../../../lib/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../../../types/tmdb'

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
  totalPages: number
  dataError?: boolean
  region: string
  availableInRegion: boolean
  page: number
  isIndexable: boolean
  indexabilityReason: string | null
}

export function providerGenreServerSideProps(media: MediaType) {
  const { discover, genres, genreTarget, basePath } = CONFIG[media]

  return async function getServerSideProps({ params, query, req, res }: GetServerSidePropsContext<{ provider: string; genre: string }>): Promise<GetServerSidePropsResult<ProviderGenrePageProps>> {
    const providerSlug = params?.provider ?? ''
    const genreSlug = params?.genre ?? ''
    const target = genreTarget(providerSlug, genreSlug)
    if (!target) return { notFound: true }

    const { page, requested } = getPageParam(query)
    if (requested && page === 1) {
      return { redirect: { destination: `${basePath}/${providerSlug}/${genreSlug}`, permanent: true } }
    }
    const region = detectRegion(req)
    const providerIds = getProviderIds(providerSlug, region)
    const providerId = providerIds.length ? providerIds.join('|') : null
    const genreId = genres[genreSlug].id
    const availableInRegion = isProviderAvailableInRegion(providerSlug, region)

    const base = {
      media,
      provider: providerSlug,
      genre: genreSlug,
      target,
      region,
      availableInRegion,
      page
    }

    try {
      const data = await discover({ providerId, genreId, genreParams: genres[genreSlug].params, region, page })
      const titles = data.results || []
      if (page > 1 && !titles.length) return { notFound: true }
      const indexability = getContentIndexability({ movies: titles })

      setSwrCache(res)
      return {
        props: {
          ...base,
          titles,
          totalPages: data.total_pages || 1,
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
          totalPages: 1,
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
  totalPages,
  dataError,
  region,
  availableInRegion,
  page,
  isIndexable,
  indexabilityReason
}: ProviderGenrePageProps) {
  const { basePath, genreBasePath, crumbRoot, noun, plural, itemWord } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${provider}/${genre}${page > 1 ? `?page=${page}` : ''}`
  const regionName = regionDisplayName(region)
  const homeRegionNames = regionListDisplayNames(streamingProviders[provider]?.regions)
  const description = availableInRegion
    ? `${target.description} Results are tuned for ${regionName}.`
    : `${target.description} ${target.providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`

  return (
    <>
      <PageHead
        title={page > 1 ? `${target.title} - Page ${page}` : target.title}
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

        {!isIndexable && indexabilityReason && (
          <Text mt={6} color='gray.500' fontSize='sm' textAlign={{ base: 'center', md: 'left' }}>
            This page is available for browsing but held out of search indexing for now: {indexabilityReason}
          </Text>
        )}
        <Text mt={6} color='gray.500' fontSize='sm' textAlign={{ base: 'center', md: 'left' }}>
          Availability changes by region and over time. Check the {itemWord} page for current provider information.
        </Text>

        {dataError ? (
          <Text mt={10} color='gray.400'>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : titles.length === 0 ? (
          <Text mt={10} color='gray.500'>No {plural} currently match this streaming collection.</Text>
        ) : (
          <PaginatedGrid
            initialTitles={titles}
            initialTotalPages={totalPages}
            initialPage={page}
            queryKey={['providerGenre', media, provider, genre, region, page]}
            fetchUrl={(p) => `/api/discover?type=${media}&provider=${provider}&genre=${genre}&region=${region}&page=${p}`}
            pagination={{ page, totalPages, hrefFor: (p) => `${basePath}/${provider}/${genre}?page=${p}` }}
          />
        )}
      </PageShell>
    </>
  );
}
