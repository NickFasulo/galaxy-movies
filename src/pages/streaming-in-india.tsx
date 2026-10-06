import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import LinkTile from '../components/LinkTile'
import SurfsharkBanner from '../components/SurfsharkBanner'
import { fetchDiscoverMovies } from '../utils/tmdb'
import { setSwrCache } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
import type { TmdbMovie } from '../types/tmdb'

interface Props {
  movies: TmdbMovie[]
  dataError?: boolean
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  try {
    const data = await fetchDiscoverMovies({ category: 'popular', region: 'IN' })
    setSwrCache(res)
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
  const canonicalUrl = `${SITE_URL}/streaming-in-india`
  const title = 'Where to Watch Movies Online in India'
  const description = 'A guide to the top streaming platforms available in India — Netflix, Amazon Prime Video, JioHotstar, ZEE5, SonyLIV, and more — plus Bollywood, Tamil, and Telugu movies to watch right now.'

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        ogLocale='en_IN'
        posterPath={movies[0]?.poster_path}
        structuredData={titleListSchema({ name: title, description, url: canonicalUrl, titles: movies, limit: movies.length })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Streaming in India', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Heading as='h2' size='md' mt={8} mb={4} textAlign={{ base: 'center', md: 'left' }}>Top streaming platforms in India</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {INDIA_PROVIDERS.map((provider) => (
            <LinkTile key={provider.key} href={`/streaming/${provider.key}`}>
              <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>

        <SurfsharkBanner message='International streaming catalogs carry titles not available in India — a VPN can unlock them.' />

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Bollywood, Tamil &amp; Telugu movies</Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          {INDIAN_LANGUAGE_CATEGORIES.map((category) => (
            <LinkTile key={category.key} href={`/browse/${category.key}`}>
              <Text fontWeight='medium' textAlign='center'>{category.label}</Text>
            </LinkTile>
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
      </PageShell>
    </>
  );
}
