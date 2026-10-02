import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../../components/MovieGrid'
import BackButton from '../../../components/BackButton'
import BreadcrumbSchema from '../../../components/BreadcrumbSchema'
import HreflangTags from '../../../components/HreflangTags'
import {
  fetchDiscoverMovies,
  getProviderId,
  isProviderAvailableInRegion,
  movieGenres,
  streamingProviders
} from '../../../utils/tmdb'
import { detectRegion } from '../../../utils/region'
import { getContentIndexability, getProviderGenreTarget } from '../../../utils/contentOpportunities'

const REGION_NAMES = { US: 'the United States', IN: 'India' }

export async function getServerSideProps({ params, req, res }) {
  const target = getProviderGenreTarget(params.provider, params.genre)
  if (!target) return { notFound: true }

  const region = detectRegion(req)
  const providerId = getProviderId(params.provider, region)
  const genreId = movieGenres[params.genre].id
  const availableInRegion = isProviderAvailableInRegion(params.provider, region)

  try {
    const data = await fetchDiscoverMovies({ providerId, genreId, region })
    const movies = data.results || []
    const indexability = getContentIndexability({ movies })

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return {
      props: {
        provider: params.provider,
        genre: params.genre,
        target,
        movies,
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
        movies: [],
        dataError: true,
        region,
        availableInRegion,
        isIndexable: indexability.isIndexable,
        indexabilityReason: indexability.reason
      }
    }
  }
}

export default function ProviderGenrePage({
  provider,
  genre,
  target,
  movies,
  dataError,
  region,
  availableInRegion,
  isIndexable,
  indexabilityReason
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/streaming/${provider}/${genre}`
  const regionName = REGION_NAMES[region] || 'your region'
  const providerConfig = streamingProviders[provider]
  const homeRegionNames = (providerConfig?.regions || []).map((r) => REGION_NAMES[r] || r).join(' and ')
  const description = availableInRegion
    ? `${target.description} Results are tuned for ${regionName}.`
    : `${target.description} ${target.providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`
  const featuredPoster = movies?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${movies[0].poster_path}`
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
    numberOfItems: movies?.length || 0,
    itemListElement: movies?.slice(0, 10).map((movie, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Movie',
        name: movie.title,
        url: `${siteUrl}/movies/${movie.id}`,
        image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        datePublished: movie.release_date || undefined
      }
    })) || []
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Streaming', url: `${siteUrl}/streaming` },
    { name: target.providerLabel, url: `${siteUrl}/streaming/${provider}` },
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
            <Link href={`/streaming/${provider}`}>{target.providerLabel} movies</Link>
            {' '}or all{' '}
            <Link href={`/genre/${genre}`}>{target.genreLabel.toLowerCase()} movies</Link>.
          </Text>

          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : movies.length === 0 ? (
            <Text mt={10} color='gray.500'>No movies currently match this streaming collection.</Text>
          ) : (
            <MovieGrid movies={movies} />
          )}

          {!isIndexable && indexabilityReason && (
            <Text textAlign='center' mt={8} color='gray.500' fontSize='sm'>
              This page is available for browsing but held out of search indexing for now: {indexabilityReason}
            </Text>
          )}
          <Text textAlign='center' mt={8} color='gray.400'>
            Availability changes by region and over time. Check the movie page for current provider information.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
