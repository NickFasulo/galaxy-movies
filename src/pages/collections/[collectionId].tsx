import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import BackButton from '../../components/BackButton'
import { fetchCollection } from '../../utils/tmdb'
import type { TmdbMovie } from '../../types/tmdb'

interface Props {
  collection: { id: number; name: string; overview: string }
  movies: TmdbMovie[]
}

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ collectionId: string }>): Promise<GetServerSidePropsResult<Props>> {
  const collectionId = params?.collectionId ?? ''
  if (!/^\d+$/.test(collectionId)) {
    return { notFound: true }
  }

  try {
    const collection = await fetchCollection(collectionId)
    if (!collection?.id) {
      return { notFound: true }
    }

    const parts = (collection.parts || [])
      .filter((movie) => movie.poster_path)
      .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return { props: { collection: { id: collection.id, name: collection.name, overview: collection.overview || '' }, movies: parts } }
  } catch (error) {
    console.error(error)
    return { notFound: true }
  }
}

export default function Collection({ collection, movies }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/collections/${collection.id}`
  const title = `${collection.name} Movies in Order`
  const description = collection.overview
    ? collection.overview.slice(0, 160)
    : `All ${movies.length} ${collection.name} movies in release order — and where each one is streaming now.`
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
    { name: 'Collections', url: `${siteUrl}/collections` },
    { name: collection.name, url: canonicalUrl }
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

          <MovieGrid movies={movies} />

          <Text textAlign='center' mt={8} color='gray.400'>
            Sorted by release date — check each movie page for current streaming, rent and buy options.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  );
}
