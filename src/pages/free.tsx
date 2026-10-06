import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { fetchListMovies, fetchListTv } from '../utils/tmdb'
import { detectRegion } from '../utils/region'
import { setSwrCache } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
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

    setSwrCache(res, 21600)
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

export default function FreeStreaming({ movies, shows, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/free`
  const title = 'Free Movies & TV Shows to Stream Now'
  const description = 'Popular movies and TV shows you can watch free right now — legally, on ad-supported services like Tubi, Pluto TV and Freevee. No subscription needed.'

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={movies[0]?.poster_path}
        structuredData={titleListSchema({ name: title, description, url: canonicalUrl, titles: movies, limit: movies.length })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Free to Stream', url: canonicalUrl }
        ]}
      />
      <PageShell withBackButton>
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
      </PageShell>
    </>
  );
}
