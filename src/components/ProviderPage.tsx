import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import LinkTile from './LinkTile'
import PageHead from './PageHead'
import PageShell from './PageShell'
import VpnBanner from './VpnBanner'
import {
  fetchDiscoverMovies,
  fetchDiscoverTv,
  streamingProviders,
  getProviderId,
  isProviderAvailableInRegion,
  type DiscoverOptions,
  type StreamingProvider
} from '../utils/tmdb'
import { detectRegion, regionDisplayName, regionListDisplayNames } from '../utils/region'
import { providerGenreSlugs, getProviderGenreTarget, tvProviderGenreSlugs, getTvProviderGenreTarget, type ProviderGenreTarget } from '../utils/contentOpportunities'
import { setSwrCache } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../types/tmdb'

interface MediaConfig {
  discover: (options: DiscoverOptions) => Promise<TmdbPaged<TitleSummary>>
  basePath: string
  otherBasePath: string
  crumbRoot: { name: string; path: string }
  noun: string
  plural: string
  itemWord: string
  genreSlugs: string[]
  genreTarget: (provider: string, genre: string) => ProviderGenreTarget | null
}

const CONFIG: Record<MediaType, MediaConfig> = {
  movie: {
    discover: fetchDiscoverMovies,
    basePath: '/streaming',
    otherBasePath: '/tv/streaming',
    crumbRoot: { name: 'Streaming', path: '/streaming' },
    noun: 'Movie',
    plural: 'movies',
    itemWord: 'movie',
    genreSlugs: providerGenreSlugs,
    genreTarget: getProviderGenreTarget
  },
  tv: {
    discover: fetchDiscoverTv,
    basePath: '/tv/streaming',
    otherBasePath: '/streaming',
    crumbRoot: { name: 'TV Shows', path: '/tv' },
    noun: 'Show',
    plural: 'shows',
    itemWord: 'show',
    genreSlugs: tvProviderGenreSlugs,
    genreTarget: getTvProviderGenreTarget
  }
}

export type ProviderPageProps = StreamingProvider & {
  media: MediaType
  provider: string
  titles: TitleSummary[]
  dataError?: boolean
  region: string
  availableInRegion: boolean
}

export function providerServerSideProps(media: MediaType) {
  const { discover } = CONFIG[media]

  return async function getServerSideProps({ params, req, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<ProviderPageProps>> {
    const slug = params?.provider ?? ''
    const provider = streamingProviders[slug]
    if (!provider) return { notFound: true }

    const region = detectRegion(req)
    const availableInRegion = isProviderAvailableInRegion(slug, region)
    const providerId = getProviderId(slug, region)
    const base = { media, provider: slug, ...provider, region, availableInRegion }

    try {
      const data = await discover({ providerId, region })
      setSwrCache(res)
      return { props: { ...base, titles: data.results } }
    } catch (error) {
      console.error(error)
      res.statusCode = 502
      return { props: { ...base, titles: [], dataError: true } }
    }
  }
}

export default function ProviderPage({ media, provider, title, titles, dataError, region, availableInRegion, regions }: ProviderPageProps) {
  const { basePath, otherBasePath, crumbRoot, noun, plural, itemWord, genreSlugs, genreTarget } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${provider}`
  const providerLabel = title.replace(' Movies', '')
  const pageTitle = media === 'tv' ? `Best Shows on ${providerLabel}` : `Best Movies on ${providerLabel}`
  const regionName = regionDisplayName(region)
  const homeRegionNames = regionListDisplayNames(regions)
  const description = availableInRegion
    ? media === 'tv'
      ? `Explore TV shows currently streaming on ${providerLabel} in ${regionName}.`
      : `Explore movies currently available on ${providerLabel} in ${regionName}.`
    : media === 'tv'
      ? `Explore TV shows currently streaming on ${providerLabel}. ${providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`
      : `Explore movies currently available on ${providerLabel}. ${providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`

  const genreTargets = genreSlugs
    .map((genreKey) => genreTarget(provider, genreKey))
    .filter((target): target is ProviderGenreTarget => Boolean(target))

  return (
    <>
      <PageHead
        title={pageTitle}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={titles[0]?.poster_path}
        structuredData={titleListSchema({ name: pageTitle, description, url: canonicalUrl, titles, media })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: crumbRoot.name, url: `${SITE_URL}${crumbRoot.path}` },
          { name: pageTitle, url: canonicalUrl }
        ]}
      />
      <PageShell title={pageTitle} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.500' fontSize='sm'>
          Looking for {media === 'tv' ? 'movies' : 'shows'} instead? Browse{' '}
          <Link href={`${otherBasePath}/${provider}`} style={{ textDecoration: 'underline' }}>{providerLabel} {media === 'tv' ? 'movies' : 'shows'}</Link>.
        </Text>
        {media === 'movie' && (
          <VpnBanner
            message={availableInRegion
              ? `${providerLabel}'s catalog differs by country — a VPN can unlock titles available in other regions.`
              : `${providerLabel} isn't available in ${regionName} — a VPN can unlock its catalog from a supported region.`}
          />
        )}
        {dataError ? (
          <Text mt={10}>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : titles.length === 0 ? (
          <Text mt={10} color='gray.500'>No {plural} currently found for this service in your region.</Text>
        ) : <MovieGrid movies={titles} />}
        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
          Browse {providerLabel}{media === 'tv' ? ' Shows' : ''} by Genre
        </Heading>
        <SimpleGrid columns={{ base: 2, md: 5 }} gap={4}>
          {genreTargets.map((target) => (
            <LinkTile key={target.genreKey} href={`${basePath}/${provider}/${target.genreKey}`}>
              <Text fontWeight='medium' textAlign='center'>{target.genreLabel}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
        <Text textAlign='center' mt={8} color='gray.400'>
          Availability changes by region and over time. Check the {itemWord} page for current provider information.
        </Text>
      </PageShell>
    </>
  );
}
