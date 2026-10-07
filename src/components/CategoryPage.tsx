import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import PageHead from './PageHead'
import PageShell from './PageShell'
import { fetchDiscoverMovies, fetchDiscoverTv, movieCategories, tvCategories, type DiscoverOptions } from '../utils/tmdb'
import { setSwrCache } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../types/tmdb'

interface CategoryDef {
  title: string
  description: string
}

interface MediaConfig {
  categories: Record<string, CategoryDef>
  discover: (options: DiscoverOptions) => Promise<TmdbPaged<TitleSummary>>
  basePath: string
  crumbRoot: { name: string; path: string }
  noun: string
}

const CONFIG: Record<MediaType, MediaConfig> = {
  movie: {
    categories: movieCategories,
    discover: fetchDiscoverMovies,
    basePath: '/browse',
    crumbRoot: { name: 'Browse', path: '/browse' },
    noun: 'Movie'
  },
  tv: {
    categories: tvCategories,
    discover: fetchDiscoverTv,
    basePath: '/tv/browse',
    crumbRoot: { name: 'TV Shows', path: '/tv' },
    noun: 'Show'
  }
}

export interface CategoryPageProps {
  media: MediaType
  category: string
  title: string
  description: string
  titles: TitleSummary[]
  dataError?: boolean
}

export function categoryServerSideProps(media: MediaType) {
  const { categories, discover } = CONFIG[media]

  return async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ category: string }>): Promise<GetServerSidePropsResult<CategoryPageProps>> {
    const slug = params?.category ?? ''
    const category = categories[slug]
    if (!category) return { notFound: true }

    const base = { media, category: slug, title: category.title, description: category.description }

    try {
      const data = await discover({ category: slug })
      setSwrCache(res)
      return { props: { ...base, titles: data.results } }
    } catch (error) {
      console.error(error)
      res.statusCode = 502
      return { props: { ...base, titles: [], dataError: true } }
    }
  }
}

const FOOTER_LINKS: Record<MediaType, ReactNode> = {
  movie: (
    <>
      Browse <Link href='/browse/popular' style={{ textDecoration: 'underline' }}>popular</Link>,{' '}
      <Link href='/browse/now-playing' style={{ textDecoration: 'underline' }}>now playing</Link>, or{' '}
      <Link href='/browse/upcoming' style={{ textDecoration: 'underline' }}>upcoming</Link> movies, or explore{' '}
      <Link href='/browse/bollywood' style={{ textDecoration: 'underline' }}>Bollywood</Link>,{' '}
      <Link href='/browse/tamil' style={{ textDecoration: 'underline' }}>Tamil</Link>, and{' '}
      <Link href='/browse/telugu' style={{ textDecoration: 'underline' }}>Telugu</Link> cinema, or check out{' '}
      <Link href='/tv' style={{ textDecoration: 'underline' }}>TV shows</Link>.
    </>
  ),
  tv: (
    <>
      Browse <Link href='/tv/browse/popular' style={{ textDecoration: 'underline' }}>popular</Link>,{' '}
      <Link href='/tv/browse/airing-today' style={{ textDecoration: 'underline' }}>airing today</Link>,{' '}
      <Link href='/tv/browse/on-the-air' style={{ textDecoration: 'underline' }}>on the air</Link>, or{' '}
      <Link href='/tv/browse/top-rated' style={{ textDecoration: 'underline' }}>top rated</Link> shows, or explore{' '}
      <Link href='/tv' style={{ textDecoration: 'underline' }}>all TV shows</Link>.
    </>
  )
}

export default function CategoryPage({ media, category, title, description, titles, dataError }: CategoryPageProps) {
  const { basePath, crumbRoot, noun } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${category}`

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={titles[0]?.poster_path}
        structuredData={titleListSchema({ name: title, description, url: canonicalUrl, titles, media })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: crumbRoot.name, url: `${SITE_URL}${crumbRoot.path}` },
          { name: title, url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {dataError ? (
          <Text mt={10}>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : <MovieGrid movies={titles} />}
        <Text textAlign='center' mt={8}>
          {FOOTER_LINKS[media]}
        </Text>
      </PageShell>
    </>
  );
}
