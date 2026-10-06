import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import PageHead from './PageHead'
import PageShell from './PageShell'
import { fetchDiscoverMovies, fetchDiscoverTv, movieGenres, tvGenres, type DiscoverOptions, type GenreDef } from '../utils/tmdb'
import { setSwrCache } from '../utils/ssr'
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
  dataError?: boolean
}

export function genreServerSideProps(media: MediaType) {
  const { genres, discover } = CONFIG[media]

  return async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ genre: string }>): Promise<GetServerSidePropsResult<GenrePageProps>> {
    const slug = params?.genre ?? ''
    const genre = genres[slug]
    if (!genre) return { notFound: true }

    const base = { media, genre: slug, title: genre.title }

    try {
      const data = await discover({ genreId: genre.id })
      setSwrCache(res)
      return { props: { ...base, titles: data.results } }
    } catch (error) {
      console.error(error)
      res.statusCode = 502
      return { props: { ...base, titles: [], dataError: true } }
    }
  }
}

export default function GenrePage({ media, genre, title, titles, dataError }: GenrePageProps) {
  const { basePath, crumbRoot, noun, plural } = CONFIG[media]
  const canonicalUrl = `${SITE_URL}${basePath}/${genre}`
  const description = `Discover ${title.toLowerCase()}, including popular picks and ${plural} worth watching.`

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
      </PageShell>
    </>
  );
}
