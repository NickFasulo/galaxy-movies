import Head from 'next/head'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import BackButton from '../../components/BackButton'
import { fetchDiscoverMovies, streamingProviders, getProviderId, isProviderAvailableInRegion } from '../../utils/tmdb'
import { detectRegion } from '../../utils/region'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'

const REGION_NAMES = { US: 'the United States', IN: 'India' }

export async function getServerSideProps({ params, req, res }) {
  const provider = streamingProviders[params.provider]
  if (!provider) return { notFound: true }

  const region = detectRegion(req)
  const availableInRegion = isProviderAvailableInRegion(params.provider, region)
  const providerId = getProviderId(params.provider, region)

  try {
    const data = await fetchDiscoverMovies({ providerId, region })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { provider: params.provider, ...provider, movies: data.results, region, availableInRegion } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { provider: params.provider, ...provider, movies: [], dataError: true, region, availableInRegion } }
  }
}

export default function StreamingPage({ provider, title, movies, dataError, region, availableInRegion, regions }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/streaming/${provider}`
  const providerLabel = title.replace(' Movies', '')
  const regionName = REGION_NAMES[region] || 'your region'
  const homeRegionNames = (regions || []).map((r) => REGION_NAMES[r] || r).join(' and ')
  const description = availableInRegion
    ? `Explore movies currently available on ${providerLabel} in ${regionName}.`
    : `Explore movies currently available on ${providerLabel}. ${providerLabel} is primarily available in ${homeRegionNames}; availability may vary in ${regionName}.`
  const featuredPoster = movies?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${movies[0].poster_path}`
    : null
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title,
    subtitle: description,
    ...(featuredPoster ? { poster: featuredPoster } : {})
  }).toString()}`

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
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
    { name: title, url: canonicalUrl }
  ]

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${title} | Galaxy Movies`} />
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
      <Box flex='1' bg='transparent' color='white' pt={{ base: '4.5rem', md: '5.5rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>
          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : <MovieGrid movies={movies} />}
          <Text textAlign='center' mt={8} color='gray.400'>
            Availability changes by region and over time. Check the movie page for current provider information.
          </Text>
          <Box mt='1.5rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
