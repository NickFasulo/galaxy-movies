import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, SimpleGrid, Text, Flex } from '@chakra-ui/react'
import MovieGrid from '../../../components/MovieGrid'
import BackButton from '../../../components/BackButton'
import { fetchDiscoverTv, streamingProviders, getProviderId, isProviderAvailableInRegion } from '../../../utils/tmdb'
import { detectRegion } from '../../../utils/region'
import BreadcrumbSchema from '../../../components/BreadcrumbSchema'
import HreflangTags from '../../../components/HreflangTags'
import { tvProviderGenreSlugs, getTvProviderGenreTarget, type ProviderGenreTarget } from '../../../utils/contentOpportunities'
import type { StreamingProvider } from '../../../utils/tmdb'
import type { NormalizedTvShow } from '../../../types/tmdb'

type Props = StreamingProvider & {
  provider: string
  shows: NormalizedTvShow[]
  dataError?: boolean
  region: string
  availableInRegion: boolean
}

const REGION_NAMES: Record<string, string> = { US: 'the United States', IN: 'India' }

export async function getServerSideProps({ params, req, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<Props>> {
  const slug = params?.provider ?? ''
  const provider = streamingProviders[slug]
  if (!provider) return { notFound: true }

  const region = detectRegion(req)
  const availableInRegion = isProviderAvailableInRegion(slug, region)
  const providerId = getProviderId(slug, region)

  try {
    const data = await fetchDiscoverTv({ providerId, region })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { provider: slug, ...provider, shows: data.results, region, availableInRegion } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { provider: slug, ...provider, shows: [], dataError: true, region, availableInRegion } }
  }
}

export default function TvStreamingPage({ provider, title, shows, dataError, region, availableInRegion, regions }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/tv/streaming/${provider}`
  const providerLabel = title.replace(' Movies', '')
  const showsTitle = `${providerLabel} Shows`
  const regionName = REGION_NAMES[region] || 'your region'
  const homeRegionNames = (regions || []).map((r) => REGION_NAMES[r] || r).join(' and ')
  const description = availableInRegion
    ? `Explore TV shows currently streaming on ${providerLabel} in ${regionName}.`
    : `Explore TV shows currently streaming on ${providerLabel}. ${providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`
  const featuredPoster = shows?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${shows[0].poster_path}`
    : null
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: showsTitle,
    subtitle: description,
    ...(featuredPoster ? { poster: featuredPoster } : {})
  }).toString()}`

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: showsTitle,
    description,
    url: canonicalUrl,
    numberOfItems: shows?.length || 0,
    itemListElement: shows?.slice(0, 10).map((show, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'TVSeries',
        name: show.name || show.title,
        url: `${siteUrl}/tv/${show.id}`,
        image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
        startDate: show.first_air_date || show.release_date || undefined
      }
    })) || []
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'TV Shows', url: `${siteUrl}/tv` },
    { name: showsTitle, url: canonicalUrl }
  ]
  const genreTargets = tvProviderGenreSlugs
    .map((genreKey) => getTvProviderGenreTarget(provider, genreKey))
    .filter((target): target is ProviderGenreTarget => Boolean(target))

  return (
    <>
      <Head>
        <title>{`${showsTitle} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${showsTitle} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${showsTitle} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListData).replace(/</g, '\\u003c')
          }}
        />
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{showsTitle}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>
          <Text maxW='42rem' mt={2} color='gray.500' fontSize='sm'>
            Looking for movies instead? Browse{' '}
            <Link href={`/streaming/${provider}`}>{providerLabel} movies</Link>.
          </Text>
          {dataError ? (
            <Text mt={10}>Show data is temporarily unavailable. Please try again later.</Text>
          ) : shows.length === 0 ? (
            <Text mt={10} color='gray.500'>No shows currently found for this service in your region.</Text>
          ) : <MovieGrid movies={shows} />}
          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            Browse {providerLabel} Shows by Genre
          </Heading>
          <SimpleGrid columns={{ base: 2, md: 5 }} gap={4}>
            {genreTargets.map((target) => (
              <Link key={target.genreKey} href={`/tv/streaming/${provider}/${target.genreKey}`}>
                <Flex
                  align='center'
                  justify='center'
                  minH='4rem'
                  p={4}
                  borderRadius='0.75rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                >
                  <Text fontWeight='medium' textAlign='center'>{target.genreLabel}</Text>
                </Flex>
              </Link>
            ))}
          </SimpleGrid>
          <Text textAlign='center' mt={8} color='gray.400'>
            Availability changes by region and over time. Check the show page for current provider information.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  );
}
