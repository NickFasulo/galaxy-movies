import type { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import TitleRail from '../features/catalog/components/TitleRail'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import LinkTile from '../components/LinkTile'
import { ANIME_PARAMS, fetchListMovies, fetchListTv, streamingProviders } from '../features/catalog/tmdb'
import { setSwrCache } from '../lib/http'
import { titleListSchema } from '../features/catalog/schema'
import { SITE_URL } from '../lib/site'
import type { TitleSummary } from '../types/tmdb'

const RAIL_SIZE = 12

// Japanese broadcast cours — anime fandom organizes around these seasons.
const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Fall']

// Providers with the biggest anime catalogs — order is display order.
const ANIME_PROVIDERS = [
  'crunchyroll',
  'netflix',
  'hulu',
  'amazon-prime-video',
  'max',
  'disney-plus',
  'tubi',
  'peacock'
]

function seasonWindow() {
  const now = new Date()
  const seasonIndex = Math.floor(now.getMonth() / 3)
  const start = new Date(now.getFullYear(), seasonIndex * 3, 1)
  const end = new Date(now.getFullYear(), seasonIndex * 3 + 3, 0)
  const iso = (d: Date) => d.toISOString().split('T')[0]
  return { name: SEASON_NAMES[seasonIndex], year: now.getFullYear(), gte: iso(start), lte: iso(end) }
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  const season = seasonWindow()
  const recentStart = new Date()
  recentStart.setDate(recentStart.getDate() - 120)
  const today = new Date().toISOString().split('T')[0]

  const [seriesData, moviesData, seasonData, newMoviesData] = await Promise.all([
    fetchListTv({ ...ANIME_PARAMS, sort_by: 'popularity.desc' }).catch(() => null),
    fetchListMovies({ ...ANIME_PARAMS, sort_by: 'popularity.desc' }).catch(() => null),
    // Low vote floor — seasonal premieres haven't accumulated votes yet.
    fetchListTv({ ...ANIME_PARAMS, 'first_air_date.gte': season.gte, 'first_air_date.lte': season.lte, 'vote_count.gte': 3, sort_by: 'popularity.desc' }).catch(() => null),
    fetchListMovies({ ...ANIME_PARAMS, 'primary_release_date.gte': recentStart.toISOString().split('T')[0], 'primary_release_date.lte': today, 'vote_count.gte': 10, sort_by: 'primary_release_date.desc' }).catch(() => null)
  ])

  setSwrCache(res)
  return {
    props: {
      seasonName: season.name,
      seasonYear: season.year,
      series: (seriesData?.results || []).slice(0, RAIL_SIZE) as TitleSummary[],
      movies: (moviesData?.results || []).slice(0, RAIL_SIZE) as TitleSummary[],
      seasonal: (seasonData?.results || []).slice(0, RAIL_SIZE) as TitleSummary[],
      newMovies: (newMoviesData?.results || []).slice(0, RAIL_SIZE) as TitleSummary[]
    }
  }
}

export default function AnimeHub({ seasonName, seasonYear, series, movies, seasonal, newMovies }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const canonicalUrl = `${SITE_URL}/anime`
  const title = 'Anime – Series & Movies Streaming Now'
  const description = "The anime hub: this season's new shows, the most popular series and films, and where to stream them — Netflix, Crunchyroll, Hulu and more."

  const structuredData = titleListSchema({ name: title, description, url: canonicalUrl, titles: [...series, ...movies] })

  const providerTiles = ANIME_PROVIDERS
    .filter((key) => streamingProviders[key])
    .map((key) => ({
      key,
      label: streamingProviders[key].title.replace(' Movies', ''),
      href: `/tv/streaming/${key}/anime`
    }))

  const trackingTiles = [
    { href: '/new-on-streaming/crunchyroll', label: 'New on Crunchyroll', note: 'Latest arrivals' },
    { href: '/leaving/crunchyroll', label: 'Leaving Crunchyroll', note: 'Departures by date' },
    { href: '/this-month/crunchyroll', label: 'Crunchyroll this month', note: 'Arrivals vs departures' },
    { href: '/lists/best-anime-series', label: 'Best anime series', note: 'Top-rated picks' },
    { href: '/lists/best-anime-movies', label: 'Best anime movies', note: 'Top-rated picks' },
    { href: '/lists/studio-ghibli-essentials', label: 'Studio Ghibli', note: 'The essential films' }
  ]

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={series[0]?.poster_path}
        structuredData={structuredData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Anime', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton maxW='84rem'>
        <TitleRail
          title={`New this season — ${seasonName} ${seasonYear}`}
          href='/tv/genre/anime'
          movies={seasonal}
        />
        <TitleRail
          title='Popular anime series'
          href='/tv/genre/anime'
          movies={series}
        />
        <TitleRail
          title='Popular anime movies'
          href='/genre/anime'
          movies={movies}
        />
        <TitleRail
          title='New anime movies'
          href='/genre/anime'
          movies={newMovies}
        />

        <Heading as='h2' size='md' mt={12} mb={4} textAlign={{ base: 'center', md: 'left' }}>Anime by service</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {providerTiles.map((tile) => (
            <LinkTile key={tile.key} href={tile.href}>
              <Text fontWeight='medium' textAlign='center'>Anime on {tile.label}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Catalog changes & picks</Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          {trackingTiles.map((tile) => (
            <LinkTile key={tile.href} href={tile.href} column>
              <Text fontWeight='semibold'>{tile.label}</Text>
              <Text fontSize='sm' color='gray.400' mt={1}>{tile.note}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
      </PageShell>
    </>
  );
}
