import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Text } from '@chakra-ui/react'
import PaginatedGrid from './PaginatedGrid'
import PageHead from './PageHead'
import PageShell from './PageShell'
import { fetchDiscoverMovies, fetchDiscoverTv, movieGenres, tvGenres, type DiscoverOptions, type GenreDef } from '../utils/tmdb'
import { setSwrCache, getPageParam } from '../utils/ssr'
import { titleListSchema } from '../utils/schema'
import { SITE_URL } from '../utils/site'
import type { MediaType, TitleSummary, TmdbPaged } from '../types/tmdb'

interface MediaConfig {
  genres: Record<string, GenreDef>
  discover: (options: DiscoverOptions) => Promise<TmdbPaged<TitleSummary>>
  basePath: string
  crumbRoot: { name: string; path: string }
  noun: string
  plural: string
}

const CONFIG: Record<MediaType, MediaConfig> = {
  movie: {
    genres: movieGenres,
    discover: fetchDiscoverMovies,
    basePath: '/genre',
    crumbRoot: { name: 'Genres', path: '/genre' },
    noun: 'Movie',
    plural: 'movies'
  },
  tv: {
    genres: tvGenres,
    discover: fetchDiscoverTv,
    basePath: '/tv/genre',
    crumbRoot: { name: 'TV Shows', path: '/tv' },
    noun: 'Show',
    plural: 'shows'
  }
}

export interface GenrePageProps {
  media: MediaType
  genre: string
  title: string
  titles: TitleSummary[]
  totalPages: number
  page: number
  dataError?: boolean
}

export function genreServerSideProps(media: MediaType) {
  const { genres, discover, basePath } = CONFIG[media]

  return async function getServerSideProps({ params, query, res }: GetServerSidePropsContext<{ genre: string }>): Promise<GetServerSidePropsResult<GenrePageProps>> {
    const slug = params?.genre ?? ''
    const genre = genres[slug]
    if (!genre) return { notFound: true }

    const { page, requested } = getPageParam(query)
    if (requested && page === 1) {
      return { redirect: { destination: `${basePath}/${slug}`, permanent: true } }
    }
    const base = { media, genre: slug, title: genre.title, page }

    try {
      const data = await discover({ genreId: genre.id, page })
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

export default function GenrePage({ media, genre, title, titles, totalPages, page, dataError }: GenrePageProps) {
  const { basePath, crumbRoot, noun, plural } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${genre}${page > 1 ? `?page=${page}` : ''}`
  const description = `Discover ${title.toLowerCase()}, including popular picks and ${plural} worth watching.`

  return (
    <>
      <PageHead
        title={page > 1 ? `${title} — Page ${page}` : title}
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
          <Text mt={10} color='gray.400'>{noun} data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <PaginatedGrid
            initialTitles={titles}
            initialTotalPages={totalPages}
            initialPage={page}
            queryKey={['genre', media, genre, page]}
            fetchUrl={(p) => `/api/discover?type=${media}&genre=${genre}&page=${p}`}
            pagination={{ page, totalPages, hrefFor: (p) => `${basePath}/${genre}?page=${p}` }}
          />
        )}
      </PageShell>
    </>
  );
}
