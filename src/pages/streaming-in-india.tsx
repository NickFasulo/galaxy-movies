import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, SimpleGrid, Text, Flex } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import { fetchDiscoverMovies } from '../utils/tmdb'
import BreadcrumbSchema from '../components/BreadcrumbSchema'
import HreflangTags from '../components/HreflangTags'
// import SurfsharkBanner from '../components/SurfsharkBanner' // affiliate monetization disabled
import BackButton from '../components/BackButton'
import type { TmdbMovie } from '../types/tmdb'

interface Props {
  movies: TmdbMovie[]
  dataError?: boolean
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  try {
    const data = await fetchDiscoverMovies({ category: 'popular', region: 'IN' })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { movies: data.results.slice(0, 10) } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { movies: [], dataError: true } }
  }
}

const INDIA_PROVIDERS = [
  { key: 'netflix', label: 'Netflix' },
  { key: 'amazon-prime-video', label: 'Amazon Prime Video' },
  { key: 'jiohotstar', label: 'JioHotstar' },
  { key: 'zee5', label: 'ZEE5' },
  { key: 'sonyliv', label: 'SonyLIV' },
  { key: 'apple-tv', label: 'Apple TV' }
]

const INDIAN_LANGUAGE_CATEGORIES = [
  { key: 'bollywood', label: 'Bollywood (Hindi) Movies' },
  { key: 'tamil', label: 'Tamil Movies' },
  { key: 'telugu', label: 'Telugu Movies' }
]

export default function StreamingInIndia({ movies, dataError }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/streaming-in-india`
  const title = 'Where to Watch Movies Online in India'
  const description = 'A guide to the top streaming platforms available in India — Netflix, Amazon Prime Video, JioHotstar, ZEE5, SonyLIV, and more — plus Bollywood, Tamil, and Telugu movies to watch right now.'
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
    itemListElement: movies?.map((movie, index) => ({
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
    { name: 'Streaming in India', url: canonicalUrl }
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
        <meta property='og:locale' content='en_IN' />
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
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>

          <Heading as='h2' size='md' mt={8} mb={4} textAlign={{ base: 'center', md: 'left' }}>Top streaming platforms in India</Heading>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            {INDIA_PROVIDERS.map((provider) => (
              <Link key={provider.key} href={`/streaming/${provider.key}`}>
                <Flex
                  align='center'
                  justify='center'
                  p={4}
                  borderRadius='0.75rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                  h='100%'
                >
                  <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
                </Flex>
              </Link>
            ))}
          </SimpleGrid>

          {/* <SurfsharkBanner message='International streaming catalogs carry titles not available in India — a VPN can unlock them.' /> */}

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Bollywood, Tamil &amp; Telugu movies</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {INDIAN_LANGUAGE_CATEGORIES.map((category) => (
              <Link key={category.key} href={`/browse/${category.key}`}>
                <Flex
                  align='center'
                  justify='center'
                  p={4}
                  borderRadius='0.75rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                  h='100%'
                >
                  <Text fontWeight='medium' textAlign='center'>{category.label}</Text>
                </Flex>
              </Link>
            ))}
          </SimpleGrid>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Popular movies to watch now</Heading>
          {dataError ? (
            <Text mt={4}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : (
            <MovieGrid movies={movies} />
          )}

          <Text textAlign='center' mt={8} color='gray.400'>
            Check each movie page for current provider availability — it changes by region and over time.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
