import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, SimpleGrid, Text, Flex } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import BackButton from '../../components/BackButton'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import { fetchDiscoverTv, tvCategories, tvGenres, streamingProviders } from '../../utils/tmdb'
import type { NormalizedTvShow } from '../../types/tmdb'

interface Props {
  shows: NormalizedTvShow[]
  dataError?: boolean
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  try {
    const data = await fetchDiscoverTv({ category: 'popular' })
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return { props: { shows: data.results || [] } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { shows: [], dataError: true } }
  }
}

function LinkGrid({ items }: { items: { href: string; label: string }[] }) {
  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <Flex
            align='center'
            justify='center'
            minH='4rem'
            p={4}
            borderRadius='0.5rem'
            border='1px solid var(--chakra-colors-white-alpha-300)'
            _hover={{ borderColor: 'whiteAlpha.600' }}
            h='100%'
          >
            <Text fontWeight='medium' textAlign='center'>{item.label}</Text>
          </Flex>
        </Link>
      ))}
    </SimpleGrid>
  );
}

export default function TvIndex({ shows, dataError }: Props) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/tv`
  const title = 'TV Shows – Browse Popular & Trending Series'
  const description = 'Discover popular TV shows, browse by genre, and find where to stream them. Galaxy Movies helps you explore top-rated series and streaming options all in one place.'
  const featuredPoster = shows?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${shows[0].poster_path}`
    : null
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: 'TV Shows',
    subtitle: 'Browse Popular & Trending Series',
    ...(featuredPoster ? { poster: featuredPoster } : {})
  }).toString()}`

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Popular TV Shows',
    description,
    url: canonicalUrl,
    numberOfItems: shows?.length || 0,
    itemListElement: shows?.slice(0, 10).map((show, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'TVSeries',
        name: show.name || show.title,
        url: `${siteUrl}/tv/${show.id}`,
        image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
        startDate: show.first_air_date || show.release_date || undefined
      }
    })) || []
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'TV Shows', url: canonicalUrl }
  ]

  const categoryLinks = Object.entries(tvCategories).map(([key, category]) => ({
    href: `/tv/browse/${key}`,
    label: category.title
  }))
  const genreLinks = Object.entries(tvGenres).map(([key, genre]) => ({
    href: `/tv/genre/${key}`,
    label: genre.title
  }))
  const providerLinks = Object.entries(streamingProviders).map(([key, provider]) => ({
    href: `/tv/streaming/${key}`,
    label: provider.title.replace(' Movies', '')
  }))

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
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>TV Shows</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>

          {dataError ? (
            <Text mt={10}>Show data is temporarily unavailable. Please try again later.</Text>
          ) : <MovieGrid movies={shows} />}

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            Browse TV Shows
          </Heading>
          <LinkGrid items={categoryLinks} />

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            TV Shows by Genre
          </Heading>
          <LinkGrid items={genreLinks} />

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            TV Shows by Streaming Service
          </Heading>
          <LinkGrid items={providerLinks} />

          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  );
}
