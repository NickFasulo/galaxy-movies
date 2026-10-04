import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../../../components/MovieGrid'
import BackButton from '../../../../components/BackButton'
import BreadcrumbSchema from '../../../../components/BreadcrumbSchema'
import HreflangTags from '../../../../components/HreflangTags'
import {
  fetchDiscoverTv,
  getProviderId,
  isProviderAvailableInRegion,
  tvGenres,
  streamingProviders
} from '../../../../utils/tmdb'
import { detectRegion } from '../../../../utils/region'
import { getContentIndexability, getTvProviderGenreTarget } from '../../../../utils/contentOpportunities'

const REGION_NAMES = { US: 'the United States', IN: 'India' }

export async function getServerSideProps({ params, req, res }) {
  const target = getTvProviderGenreTarget(params.provider, params.genre)
  if (!target) return { notFound: true }

  const region = detectRegion(req)
  const providerId = getProviderId(params.provider, region)
  const genreId = tvGenres[params.genre].id
  const availableInRegion = isProviderAvailableInRegion(params.provider, region)

  try {
    const data = await fetchDiscoverTv({ providerId, genreId, region })
    const shows = data.results || []
    const indexability = getContentIndexability({ movies: shows })

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return {
      props: {
        provider: params.provider,
        genre: params.genre,
        target,
        shows,
        region,
        availableInRegion,
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
        provider: params.provider,
        genre: params.genre,
        target,
        shows: [],
        dataError: true,
        region,
        availableInRegion,
        isIndexable: indexability.isIndexable,
        indexabilityReason: indexability.reason
      }
    }
  }
}

export default function TvProviderGenrePage({
  provider,
  genre,
  target,
  shows,
  dataError,
  region,
  availableInRegion,
  isIndexable,
  indexabilityReason
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/tv/streaming/${provider}/${genre}`
  const regionName = REGION_NAMES[region] || 'your region'
  const providerConfig = streamingProviders[provider]
  const homeRegionNames = (providerConfig?.regions || []).map((r) => REGION_NAMES[r] || r).join(' and ')
  const description = availableInRegion
    ? `${target.description} Results are tuned for ${regionName}.`
    : `${target.description} ${target.providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`
  const featuredPoster = shows?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${shows[0].poster_path}`
    : null
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: target.title,
    subtitle: description,
    ...(featuredPoster ? { poster: featuredPoster } : {})
  }).toString()}`

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: target.title,
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
    { name: target.providerLabel, url: `${siteUrl}/tv/streaming/${provider}` },
    { name: target.genreLabel, url: canonicalUrl }
  ]

  return (
    <>
      <Head>
        <title>{`${target.title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        {!isIndexable && <meta name='robots' content='noindex,follow' />}
        <link rel='canonical' href={canonicalUrl} />
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${target.title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${target.title} | Galaxy Movies`} />
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
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{target.title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>
          <Text maxW='42rem' mt={2} color='gray.500' fontSize='sm'>
            Browse all{' '}
            <Link href={`/tv/streaming/${provider}`}>{target.providerLabel} shows</Link>
            {' '}or all{' '}
            <Link href={`/tv/genre/${genre}`}>{target.genreLabel.toLowerCase()} shows</Link>.
          </Text>

          {dataError ? (
            <Text mt={10}>Show data is temporarily unavailable. Please try again later.</Text>
          ) : shows.length === 0 ? (
            <Text mt={10} color='gray.500'>No shows currently match this streaming collection.</Text>
          ) : (
            <MovieGrid movies={shows} />
          )}

          {!isIndexable && indexabilityReason && (
            <Text textAlign='center' mt={8} color='gray.500' fontSize='sm'>
              This page is available for browsing but held out of search indexing for now: {indexabilityReason}
            </Text>
          )}
          <Text textAlign='center' mt={8} color='gray.400'>
            Availability changes by region and over time. Check the show page for current provider information.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
