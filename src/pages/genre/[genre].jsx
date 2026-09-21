import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import { fetchDiscoverMovies, movieGenres } from '../../utils/tmdb'

export async function getServerSideProps({ params, res }) {
  const genre = movieGenres[params.genre]
  if (!genre) return { notFound: true }

  try {
    const data = await fetchDiscoverMovies({ genreId: genre.id })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { genre: params.genre, ...genre, movies: data.results } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { genre: params.genre, ...genre, movies: [], dataError: true } }
  }
}

export default function GenrePage({ genre, title, movies, dataError }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/genre/${genre}`
  const description = `Discover ${title.toLowerCase()}, including popular picks and movies worth watching.`

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:title' content={`${title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />

        <meta name='twitter:card' content='summary' />
        <meta name='twitter:title' content={`${title} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
      </Head>
      <Box minH='100vh' py={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Link href='/'>← Galaxy Movies</Link>
          <Heading as='h1' mt={8}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.600'>{description}</Text>
          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : <MovieGrid movies={movies} />}
        </Box>
      </Box>
    </>
  )
}
