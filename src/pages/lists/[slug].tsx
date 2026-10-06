import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import BackButton from '../../components/BackButton'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import { fetchListMovies, fetchListTv, fetchRecommendedMovies, fetchRecommendedTv } from '../../utils/tmdb'
import { getCuratedList } from '../../utils/curatedLists'
import { getGeneratedList } from '../../utils/generatedLists'
import { getOrGenerateListIntro } from '../../utils/listIntro'
import type { TitleSummary } from '../../types/tmdb'

interface Props {
  slug: string
  title: string
  tagline: string
  movies: TitleSummary[]
  dataError?: boolean
  intro: string | null
}

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ slug: string }>): Promise<GetServerSidePropsResult<Props>> {
  const slug = params?.slug ?? ''
  const list = getCuratedList(slug) || (await getGeneratedList(slug))
  if (!list) return { notFound: true }

  try {
    const isTv = list.media === 'tv'
    const data = list.type === 'similar'
      ? (isTv ? await fetchRecommendedTv(list.movieId) : await fetchRecommendedMovies(list.movieId))
      : (isTv ? await fetchListTv(list.params) : await fetchListMovies(list.params))
    const movies: TitleSummary[] = data.results || []

    const intro = await getOrGenerateListIntro({
      slug,
      title: list.title,
      tagline: list.tagline,
      sampleTitles: movies.slice(0, 5).map((movie) => movie.title).filter((title): title is string => Boolean(title))
    })

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { slug, title: list.title, tagline: list.tagline, movies, intro: intro || null } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { slug, title: list.title, tagline: list.tagline, movies: [], dataError: true, intro: null } }
  }
}

export default function CuratedListPage({ slug, title, tagline, movies, dataError, intro }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/lists/${slug}`
  const description = tagline
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
        '@type': movie.mediaType === 'tv' ? 'TVSeries' : 'Movie',
        name: movie.title,
        url: `${siteUrl}/${movie.mediaType === 'tv' ? 'tv' : 'movies'}/${movie.id}`,
        image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        datePublished: movie.release_date || undefined
      }
    })) || []
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Lists', url: `${siteUrl}/lists` },
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
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{tagline}</Text>
          {intro && (
            <Text maxW='42rem' mt={4} color='gray.300'>{intro}</Text>
          )}
          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : movies.length === 0 ? (
            <Text mt={10} color='gray.500'>No movies currently match this collection.</Text>
          ) : (
            <MovieGrid movies={movies} />
          )}
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  );
}
