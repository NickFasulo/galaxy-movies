import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Text } from '@chakra-ui/react'
import PaginatedGrid from './PaginatedGrid'
import PageHead from '../../../components/PageHead'
import PageShell from '../../../components/PageShell'
import { fetchDiscoverMovies, fetchDiscoverTv, movieCategories, tvCategories, type DiscoverOptions } from '../tmdb'
import { setSwrCache, getPageParam } from '../../../lib/http'
import { titleListSchema } from '../schema'
import { SITE_URL } from '../../../lib/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../../../types/tmdb'

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
  totalPages: number
  page: number
  dataError?: boolean
}

export function categoryServerSideProps(media: MediaType) {
  const { categories, discover, basePath } = CONFIG[media]

  return async function getServerSideProps({ params, query, res }: GetServerSidePropsContext<{ category: string }>): Promise<GetServerSidePropsResult<CategoryPageProps>> {
    const slug = params?.category ?? ''
    const category = categories[slug]
    if (!category) return { notFound: true }

    const { page, requested } = getPageParam(query)
    if (requested && page === 1) {
      return { redirect: { destination: `${basePath}/${slug}`, permanent: true } }
    }
    const base = { media, category: slug, title: category.title, description: category.description, page }

    try {
      const data = await discover({ category: slug, page })
      if (page > 1 && !data.results?.length) return { notFound: true }
      setSwrCache(res)
      return { props: { ...base, titles: data.results, totalPages: data.total_pages || 1 } }
    } catch (error) {
      console.error(error)
      res.statusCode = 502
      return { props: { ...base, titles: [], totalPages: 1, dataError: true } }
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

export default function CategoryPage({ media, category, title, description, titles, totalPages, page, dataError }: CategoryPageProps) {
  const { basePath, crumbRoot, noun } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${category}${page > 1 ? `?page=${page}` : ''}`

  return (
    <>
      <PageHead
        title={page > 1 ? `${title} - Page ${page}` : title}
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
        <Text maxW='42rem' mt={2} color='gray.500' fontSize='sm' textAlign={{ base: 'center', md: 'left' }}>
          {FOOTER_LINKS[media]}
        </Text>
        {dataError ? (
          <Text mt={10} color='gray.400'>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <PaginatedGrid
            initialTitles={titles}
            initialTotalPages={totalPages}
            initialPage={page}
            queryKey={['category', media, category, page]}
            fetchUrl={(p) => `/api/discover?type=${media}&category=${category}&page=${p}`}
            pagination={{ page, totalPages, hrefFor: (p) => `${basePath}/${category}?page=${p}` }}
          />
        )}
      </PageShell>
    </>
  );
}
