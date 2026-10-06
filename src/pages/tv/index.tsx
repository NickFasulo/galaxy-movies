import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'
import { fetchDiscoverTv, tvCategories, tvGenres, streamingProviders } from '../../utils/tmdb'
import { setSwrCache } from '../../utils/ssr'
import { titleListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import type { TitleSummary } from '../../types/tmdb'

interface Props {
  shows: TitleSummary[]
  dataError?: boolean
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  try {
    const data = await fetchDiscoverTv({ category: 'popular' })
    setSwrCache(res)
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
        <LinkTile key={item.href} href={item.href}>
          <Text fontWeight='medium' textAlign='center'>{item.label}</Text>
        </LinkTile>
      ))}
    </SimpleGrid>
  );
}

export default function TvIndex({ shows, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/tv`
  const title = 'TV Shows – Browse Popular & Trending Series'
  const description = 'Discover popular TV shows, browse by genre, and find where to stream them. Galaxy Movies helps you explore top-rated series and streaming options all in one place.'

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
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        ogTitle='TV Shows'
        ogSubtitle='Browse Popular & Trending Series'
        posterPath={shows[0]?.poster_path}
        structuredData={titleListSchema({ name: 'Popular TV Shows', description, url: canonicalUrl, titles: shows, media: 'tv' })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'TV Shows', url: canonicalUrl }
        ]}
      />
      <PageShell title='TV Shows' description={description} withBackButton>
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
      </PageShell>
    </>
  );
}
