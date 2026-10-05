import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import BreadcrumbSchema from '../components/BreadcrumbSchema'
import HreflangTags from '../components/HreflangTags'
import BackButton from '../components/BackButton'
import { fetchListMovies, fetchListTv } from '../utils/tmdb'
import { detectRegion } from '../utils/region'
import type { NormalizedTvShow, TmdbMovie } from '../types/tmdb'

interface Props {
  region: string
  movies: TmdbMovie[]
  shows: NormalizedTvShow[]
  dataError?: boolean
}

const TITLE_COUNT = 15

export async function getServerSideProps({ req, res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const region = detectRegion(req)
  try {
    const params = {
      watch_region: region,
      with_watch_monetization_types: 'free|ads',
      sort_by: 'popularity.desc'
    }
    const [movies, shows] = await Promise.all([
      fetchListMovies(params),
      fetchListTv(params)
    ])

    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400')
    return {
      props: {
        region,
        movies: (movies.results || []).slice(0, TITLE_COUNT),
        shows: (shows.results || []).slice(0, TITLE_COUNT)
      }
    }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { region, movies: [], shows: [], dataError: true } }
  }
}

export default function FreeStreaming({ region, movies, shows, dataError }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/free`
  const title = 'Free Movies & TV Shows to Stream Now'
  const description = 'Popular movies and TV shows you can watch free right now — legally, on ad-supported services like Tubi, Pluto TV and Freevee. No subscription needed.'
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
    numberOfItems: movies.length,
    itemListElement: movies.map((movie, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Movie',
        name: movie.title,
        url: `${siteUrl}/movies/${movie.id}`,
        image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        datePublished: movie.release_date || undefined
      }
    }))
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Free to Stream', url: canonicalUrl }
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
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} ml={{ base: '1rem', md: '5rem' }} color='gray.400'>{description}</Text>

          {dataError ? (
            <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
          ) : (
            <>
              <Heading as='h2' size='md' mt={10} mb={4} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                Free movies
              </Heading>
              {movies.length > 0 ? <MovieGrid movies={movies} /> : <Text color='gray.500' ml={{ base: '1rem', md: '5rem' }}>No free movies found in your region right now.</Text>}

              <Heading as='h2' size='md' mt={10} mb={4} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                Free TV shows
              </Heading>
              {shows.length > 0 ? <MovieGrid movies={shows} /> : <Text color='gray.500' ml={{ base: '1rem', md: '5rem' }}>No free shows found in your region right now.</Text>}
            </>
          )}

          <Text maxW='42rem' mt={10} ml={{ base: '1rem', md: '5rem' }} color='gray.400' fontStyle='italic'>
            Rather rent or buy instead? Compare prices on any movie page, or browse by{' '}
            <Link href='/streaming'>streaming service</Link> and{' '}
            <Link href='/new-on-streaming'>new releases</Link>.
          </Text>

          <Text textAlign='center' mt={8} color='gray.400'>
            Free availability is ad-supported and changes by region and over time — check each title page for current options.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
