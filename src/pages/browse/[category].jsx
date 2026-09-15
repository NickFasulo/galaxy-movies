import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import { fetchDiscoverMovies, movieCategories } from '../../utils/tmdb'

export async function getServerSideProps({ params, res }) {
  const category = movieCategories[params.category]
  if (!category) return { notFound: true }

  try {
    const data = await fetchDiscoverMovies({ category: params.category })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { category: params.category, ...category, movies: data.results } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { category: params.category, ...category, movies: [], dataError: true } }
  }
}

export default function BrowsePage({ category, title, description, movies, dataError }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'
  const canonicalUrl = `${siteUrl}/browse/${category}`

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
      </Head>
      <Box minH='100vh' py={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Link href='/'>← Galaxy Movies</Link>
          <Heading as='h1' mt={8}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.600'>{description}</Text>
          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : <MovieGrid movies={movies} />}
          <Text textAlign='center' mt={8}>
            Browse <Link href='/browse/popular'>popular</Link>,{' '}
            <Link href='/browse/now-playing'>now playing</Link>, or{' '}
            <Link href='/browse/upcoming'>upcoming</Link> movies.
          </Text>
        </Box>
      </Box>
    </>
  )
}
