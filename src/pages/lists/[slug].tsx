import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Text } from '@chakra-ui/react'
import MovieGrid from '../../components/MovieGrid'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { fetchListMovies, fetchListTv, fetchRecommendedMovies, fetchRecommendedTv } from '../../utils/tmdb'
import { getCuratedList } from '../../utils/curatedLists'
import { getGeneratedList } from '../../utils/generatedLists'
import { getOrGenerateListIntro } from '../../utils/listIntro'
import { setSwrCache } from '../../utils/ssr'
import { titleListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
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

    setSwrCache(res)
    return { props: { slug, title: list.title, tagline: list.tagline, movies, intro: intro || null } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { slug, title: list.title, tagline: list.tagline, movies: [], dataError: true, intro: null } }
  }
}

export default function CuratedListPage({ slug, title, tagline, movies, dataError, intro }: Props) {
  const canonicalUrl = `${SITE_URL}/lists/${slug}`

  return (
    <>
      <PageHead
        title={title}
        description={tagline}
        canonicalUrl={canonicalUrl}
        posterPath={movies[0]?.poster_path}
        structuredData={titleListSchema({ name: title, description: tagline, url: canonicalUrl, titles: movies })}
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
        {dataError ? (
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
