import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Badge, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import PaginatedGrid from './PaginatedGrid'
import LinkTile from './LinkTile'
import PageHead from './PageHead'
import PageShell from './PageShell'
import VpnBanner from './VpnBanner'
import {
  fetchDiscoverMovies,
  fetchDiscoverTv,
  streamingProviders,
  getProviderIds,
  isProviderAvailableInRegion,
  type DiscoverOptions,
  type StreamingProvider
} from '../utils/tmdb'
import { detectRegion, regionDisplayName, regionListDisplayNames } from '../utils/region'
import { getProviderChanges, type ProviderChanges } from '../utils/streamingChanges'
import { providerGenreSlugs, getProviderGenreTarget, tvProviderGenreSlugs, getTvProviderGenreTarget, type ProviderGenreTarget } from '../utils/contentOpportunities'
import { setSwrCache, getPageParam } from '../utils/ssr'
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
  totalPages: number
  changes: ProviderChanges | null
  dataError?: boolean
  region: string
  page: number
  availableInRegion: boolean
}

export function providerServerSideProps(media: MediaType) {
  const { discover, basePath } = CONFIG[media]

  return async function getServerSideProps({ params, query, req, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<ProviderPageProps>> {
    const slug = params?.provider ?? ''
    const provider = streamingProviders[slug]
    if (!provider) return { notFound: true }

    const { page, requested } = getPageParam(query)
    if (requested && page === 1) {
      return { redirect: { destination: `${basePath}/${slug}`, permanent: true } }
    }
    const region = detectRegion(req)
    const availableInRegion = isProviderAvailableInRegion(slug, region)
    const providerIds = getProviderIds(slug, region)
    const providerId = providerIds.length ? providerIds.join('|') : null
    const base = { media, provider: slug, ...provider, region, availableInRegion, page }

    try {
      // Diffs only exist for US (Watchmode) and IN (TMDB snapshots) catalogs;
      // IN diffs live under `changes:diff:IN:{key}` — passing the prefixed key
      // reads them through the same memoized lookup. LRU-memoized, so repeat
      // renders cost zero Redis commands.
      const changeKey = region === 'IN' ? `IN:${slug}` : slug
      const [data, changesMap] = await Promise.all([
        discover({ providerId, region, page }),
        media === 'movie' && (region === 'US' || region === 'IN')
          ? getProviderChanges([changeKey]).catch((): Record<string, ProviderChanges> => ({}))
          : Promise.resolve<Record<string, ProviderChanges>>({})
      ])
      if (page > 1 && !data.results?.length) return { notFound: true }
      setSwrCache(res)
      return { props: { ...base, titles: data.results, totalPages: data.total_pages || 1, changes: changesMap[changeKey] || null } }
    } catch (error) {
      console.error(error)
      res.statusCode = 502
      return { props: { ...base, titles: [], totalPages: 1, changes: null, dataError: true } }
    }
  }
}

export default function ProviderPage({ media, provider, title, titles, totalPages, changes, dataError, region, page, availableInRegion, regions }: ProviderPageProps) {
  const { basePath, otherBasePath, crumbRoot, noun, plural, itemWord, genreSlugs, genreTarget } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${provider}${page > 1 ? `?page=${page}` : ''}`
  const providerLabel = title.replace(' Movies', '')
  const pageTitle = media === 'tv' ? `Best Shows on ${providerLabel}` : `Best Movies on ${providerLabel}`
  const metaTitle = page > 1 ? `${pageTitle} — Page ${page}` : pageTitle
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
  const siblingProviders = Object.keys(streamingProviders)
    .filter((key) => key !== provider && isProviderAvailableInRegion(key, region))
    .slice(0, 7)

  return (
    <>
      <PageHead
        title={metaTitle}
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

        {changes && (changes.coming.length > 0 || changes.left.length > 0) && (
          <>
            {changes.coming.length > 0 && (
              <>
                <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
                  Coming soon to {providerLabel}
                </Heading>
                <Flex wrap='wrap' gap={2} justify={{ base: 'center', md: 'flex-start' }}>
                  {changes.coming.slice(0, 10).map((item) => (
                    <Link
                      key={`${item.tmdbType}:${item.tmdbId}`}
                      href={`/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`}
                      data-umami-event='coming-soon-click'
                      style={{ textDecoration: 'none' }}>
                      <Badge cursor='pointer' px={3} py={1.5} borderRadius='md' bg='whiteAlpha.200' color='white' fontSize='xs' _hover={{ bg: 'whiteAlpha.300' }}>
                        {item.title}{item.date ? ` · ${item.date}` : ''}
                      </Badge>
                    </Link>
                  ))}
                </Flex>
              </>
            )}
            {changes.left.filter((item) => item.tmdbId).length > 0 && (
              <>
                <Heading as='h2' size='sm' mt={8} mb={3} textAlign={{ base: 'center', md: 'left' }} color='gray.300'>
                  Recently left {providerLabel}
                </Heading>
                <Flex wrap='wrap' gap={2} justify={{ base: 'center', md: 'flex-start' }}>
                  {changes.left.filter((item) => item.tmdbId).slice(0, 8).map((item) => (
                    <Link
                      key={`${item.tmdbType}:${item.tmdbId}`}
                      href={`/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`}
                      data-umami-event='leaving-click'
                      style={{ textDecoration: 'none' }}>
                      <Badge cursor='pointer' px={3} py={1.5} borderRadius='md' bg='whiteAlpha.100' color='gray.400' fontSize='xs' _hover={{ color: 'white' }}>
                        {item.title}
                      </Badge>
                    </Link>
                  ))}
                </Flex>
              </>
            )}
          </>
        )}

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
          Compare other services
        </Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {siblingProviders.map((key) => (
            <LinkTile key={key} href={`${basePath}/${key}`}>
              <Text fontWeight='medium' textAlign='center'>{streamingProviders[key].title.replace(' Movies', '')}</Text>
            </LinkTile>
          ))}
          <LinkTile href={media === 'tv' ? '/tv' : '/streaming'}>
            <Text fontWeight='medium' textAlign='center'>All services →</Text>
          </LinkTile>
        </SimpleGrid>
        <Text textAlign={{ base: 'center', md: 'left' }} mt={8} color='gray.500' fontSize='sm'>
          Availability changes by region and over time. Check the {itemWord} page for current provider information.
        </Text>
        {dataError ? (
          <Text mt={10} color='gray.400'>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : titles.length === 0 ? (
          <Text mt={10} color='gray.500'>No {plural} currently found for this service in your region.</Text>
        ) : (
          <PaginatedGrid
            initialTitles={titles}
            initialTotalPages={totalPages}
            initialPage={page}
            queryKey={['provider', media, provider, region, page]}
            fetchUrl={(p) => `/api/discover?type=${media}&provider=${provider}&region=${region}&page=${p}`}
            pagination={{ page, totalPages, hrefFor: (p) => `${basePath}/${provider}?page=${p}` }}
          />
        )}
      </PageShell>
    </>
  );
}
