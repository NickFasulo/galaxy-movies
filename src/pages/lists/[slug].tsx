import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Heading, Icon, Link as ChakraLink, SimpleGrid, Text } from '@chakra-ui/react'
import { LuExternalLink } from 'react-icons/lu'
import MovieGrid from '../../components/MovieGrid'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { fetchListMovies, fetchListTv, fetchRecommendedMovies, fetchRecommendedTv } from '../../utils/tmdb'
import { getCuratedList, type EditorialSection } from '../../utils/curatedLists'
import { getGeneratedList } from '../../utils/generatedLists'
import { getOrGenerateListIntro } from '../../utils/listIntro'
import { setSwrCache } from '../../utils/ssr'
import { itemListSchema, titleListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import type { TitleSummary } from '../../types/tmdb'

interface Props {
  slug: string
  title: string
  tagline: string
  movies: TitleSummary[]
  dataError?: boolean
  intro: string | null
  sections: EditorialSection[] | null
  relatedHeading: string | null
}

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ slug: string }>): Promise<GetServerSidePropsResult<Props>> {
  const slug = params?.slug ?? ''
  const list = getCuratedList(slug) || (await getGeneratedList(slug))
  if (!list) return { notFound: true }

  try {
    const isTv = list.media === 'tv'
    const isEditorial = list.type === 'editorial'
    const data = isEditorial
      ? (list.relatedParams
          ? (isTv ? await fetchListTv(list.relatedParams) : await fetchListMovies(list.relatedParams))
          : { results: [] })
      : list.type === 'similar'
        ? (isTv ? await fetchRecommendedTv(list.movieId) : await fetchRecommendedMovies(list.movieId))
        : (isTv ? await fetchListTv(list.params) : await fetchListMovies(list.params))
    const movies: TitleSummary[] = data.results || []

    const intro = isEditorial ? null : await getOrGenerateListIntro({
      slug,
      title: list.title,
      tagline: list.tagline,
      sampleTitles: movies.slice(0, 5).map((movie) => movie.title).filter((title): title is string => Boolean(title))
    })

    setSwrCache(res)
    return {
      props: {
        slug,
        title: list.title,
        tagline: list.tagline,
        movies,
        intro,
        sections: isEditorial ? list.sections : null,
        relatedHeading: isEditorial ? list.relatedHeading || null : null
      }
    }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { slug, title: list.title, tagline: list.tagline, movies: [], dataError: true, intro: null, sections: null, relatedHeading: null } }
  }
}

export default function CuratedListPage({ slug, title, tagline, movies, dataError, intro, sections, relatedHeading }: Props) {
  const canonicalUrl = `${SITE_URL}/lists/${slug}`

  const structuredData = sections
    ? itemListSchema({
        name: title,
        description: tagline,
        url: canonicalUrl,
        items: sections.flatMap((section) => section.items ?? []).map((item) => ({
          '@type': item.kind === 'podcast' ? 'PodcastSeries' : item.kind === 'book' ? 'Book' : 'CreativeWork',
          name: item.name,
          url: item.url || (item.path ? `${SITE_URL}${item.path}` : undefined)
        }))
      })
    : titleListSchema({ name: title, description: tagline, url: canonicalUrl, titles: movies })

  return (
    <>
      <PageHead
        title={title}
        description={tagline}
        canonicalUrl={canonicalUrl}
        posterPath={movies[0]?.poster_path}
        structuredData={structuredData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Lists', url: `${SITE_URL}/lists` },
          { name: title, url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={tagline} withBackButton>
        {intro && (
          <Text maxW='42rem' mt={4} color='gray.300'>{intro}</Text>
        )}
        {sections?.map((section, sectionIndex) => (
          <Box key={sectionIndex} mt={sectionIndex === 0 ? 8 : 10}>
            {section.heading && (
              <Heading as='h2' size='md' mb={4} textAlign={{ base: 'center', md: 'left' }}>{section.heading}</Heading>
            )}
            {section.paragraphs?.map((paragraph, paragraphIndex) => (
              <Text key={paragraphIndex} maxW='60rem' mt={paragraphIndex === 0 ? 0 : 4}>{paragraph}</Text>
            ))}
            {section.items && (
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={6}>
                {section.items.map((item) => (
                  <Box key={item.name} p={4} borderRadius='0.5rem' border='1px solid var(--chakra-colors-border-subtle)'>
                    {item.url ? (
                      <ChakraLink href={item.url} target='_blank' rel='noopener noreferrer' fontWeight='semibold' color='blue.300'>
                        {item.name} <Icon mx='2px' asChild><LuExternalLink /></Icon>
                      </ChakraLink>
                    ) : (
                      <Text fontWeight='semibold'>{item.name}</Text>
                    )}
                    <Text fontSize='sm' color='gray.400' mt={1}>{item.description}</Text>
                    {item.path && (
                      <Text fontSize='sm' color='blue.300' mt={2}>
                        <Link href={item.path} style={{ textDecoration: 'underline' }}>{item.pathLabel || 'Read more'} →</Link>
                      </Text>
                    )}
                  </Box>
                ))}
              </SimpleGrid>
            )}
          </Box>
        ))}
        {sections ? (
          movies.length > 0 && (
            <>
              <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
                {relatedHeading || 'Related titles'}
              </Heading>
              <MovieGrid movies={movies} />
            </>
          )
        ) : dataError ? (
          <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
        ) : movies.length === 0 ? (
          <Text mt={10} color='gray.500'>No movies currently match this collection.</Text>
        ) : (
          <MovieGrid movies={movies} />
        )}
      </PageShell>
    </>
  );
}
