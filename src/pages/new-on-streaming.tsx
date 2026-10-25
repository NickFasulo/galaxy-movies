import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../features/catalog/components/MovieGrid'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { streamingProviders, getProviderIds, isProviderAvailableInRegion, fetchListMovies, PROVIDER_NAME_MATCH } from '../features/catalog/tmdb'
import { detectRegion } from '../lib/region'
import { withTimeout } from '../lib/withTimeout'
import { getProviderChanges, type ProviderChanges } from '../features/catalog/streamingChanges'
import { setSwrCache } from '../lib/http'
import { shortDate } from '../lib/format/formatters'
import { itemListSchema, titleItem } from '../features/catalog/schema'
import { SITE_URL } from '../lib/site'
import type { MediaType, TmdbMovie } from '../types/tmdb'

interface Section {
  key: string
  label: string
  movies: TmdbMovie[]
}

interface Props {
  region: string
  sections: Section[]
  changes?: Record<string, ProviderChanges>
  dataError?: boolean
}

interface ChangeItem {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  year?: number | null
  date?: string
  season?: number | null
}

const NEW_RELEASE_WINDOW_DAYS = 45
const MOVIES_PER_PROVIDER = 6

export async function getServerSideProps({ req, res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const region = detectRegion(req)
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - NEW_RELEASE_WINDOW_DAYS)
  const dateParams = {
    'primary_release_date.gte': windowStart.toISOString().split('T')[0],
    'primary_release_date.lte': today.toISOString().split('T')[0],
    sort_by: 'primary_release_date.desc'
  }

  const availableProviders = Object.entries(streamingProviders)
    .filter(([key]) => isProviderAvailableInRegion(key, region))

  try {
    const results = await Promise.all(
      availableProviders.map(async ([key, provider]) => {
        const providerIds = getProviderIds(key, region)
        const data = await fetchListMovies({
          ...dateParams,
          with_watch_providers: providerIds.join('|'),
          watch_region: region
        })
        return { key, label: provider.title.replace(' Movies', ''), movies: (data.results || []).slice(0, MOVIES_PER_PROVIDER) }
      })
    )

    const sections = results.filter((section) => section.movies.length > 0)
    const changes: Record<string, ProviderChanges> = (await withTimeout(
      getProviderChanges(sections.map((section) => section.key)),
      2000,
      {}
    )) || {}

    setSwrCache(res, 21600)
    return { props: { region, sections, changes } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { region, sections: [], dataError: true } }
  }
}

const formatChangeDate = shortDate

function ChangeList({ label, items, showDate = false }: { label: string; items?: ChangeItem[]; showDate?: boolean }) {
  if (!items?.length) return null
  return (
    <Box mb={3}>
      <Text fontSize='sm' color='gray.400' mb={1}>{label}</Text>
      <Box fontSize='sm' color='whiteAlpha.900'>
        {items.map((t, i) => (
          <Box
            key={`${t.tmdbType}-${t.tmdbId}-${t.date || t.title}`}
            display={{ base: 'list-item', md: 'inline' }}
            ml={{ base: 4, md: 0 }}
            py={{ base: 0.5, md: 0 }}
            css={{ '::marker': { color: 'var(--chakra-colors-gray-600)' } }}
          >
            {i > 0 && (
              <Text as='span' color='gray.600' display={{ base: 'none', md: 'inline' }}>
                {'\u00A0· '}
              </Text>
            )}
            <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
              <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>
                {t.title}{t.year ? ` (${t.year})` : ''}{showDate && t.date ? ` - ${formatChangeDate(t.date)}` : ''}{t.season ? ` (season ${t.season})` : ''}
              </Text>
            </Link>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default function NewOnStreaming({ sections, changes = {}, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/new-on-streaming`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = `New Releases Streaming Now (${monthLabel})`
  const description = `Recently released movies currently streaming by service, updated regularly: including Netflix, Amazon Prime Video, and more.`

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    numberOfItems: sections.reduce((sum, section) => sum + section.movies.length, 0),
    items: sections.flatMap((section) => section.movies).slice(0, 20).map((movie) => titleItem(movie))
  })

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'New on Streaming', url: canonicalUrl }
        ]}
      >
        <link rel='alternate' type='application/rss+xml' title='Galaxy Movies streaming changes' href={`${SITE_URL}/leaving.xml`} />
      </PageHead>
      <PageShell title={title} description={description} withBackButton>
          <Flex wrap='wrap' columnGap={2} rowGap={1} mt={2} fontSize='sm' align='center'>
            <Text color='gray.500'>Dated arrivals by service:</Text>
            {Object.keys(PROVIDER_NAME_MATCH)
              .filter((key) => streamingProviders[key])
              .map((key, i, arr) => (
                <Text key={key} as='span'>
                  <Link href={`/new-on-streaming/${key}`} style={{ textDecoration: 'underline' }}>
                    {streamingProviders[key].title.replace(' Movies', '')}
                  </Link>
                  {i < arr.length - 1 && <Text as='span' color='gray.600'> ·</Text>}
                </Text>
              ))}
          </Flex>
          {dataError ? (
            <Text mt={10} color='gray.400'>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : sections.length === 0 ? (
            <Text mt={10} color='gray.500'>No recent releases found for your region right now.</Text>
          ) : (
            sections.map((section) => (
              <Box key={section.key} mt={10}>
                <Heading as='h2' size='md' mb={4} textAlign={{ base: 'center', md: 'left' }}>
                  <Link href={`/streaming/${section.key}`} style={{ textDecoration: 'underline' }}>{section.label}</Link>
                </Heading>
                <MovieGrid movies={section.movies} />
              </Box>
            ))
          )}

          {Object.keys(changes).length > 0 && (
            <Box mt={14}>
              <Heading as='h2' size='md' mb={6} textAlign={{ base: 'center', md: 'left' }}>
                Coming soon &amp; recently changed
              </Heading>
              <Box>
                {Object.entries(changes).map(([key, change]) => (
                  <Box key={key} mb={8}>
                    <Heading as='h3' size='sm' mb={3}>
                      <Link href={`/streaming/${key}`} style={{ textDecoration: 'underline' }}>{change.source}</Link>
                    </Heading>
                    <ChangeList label='Coming soon' items={change.coming} showDate />
                    <ChangeList label='Just added' items={change.added} />
                    <ChangeList label='Left recently' items={change.left} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Text textAlign='center' mt={10} color='gray.400'>
            Showing movies released in the last {NEW_RELEASE_WINDOW_DAYS} days and currently available to stream. Availability changes by region and over time.
          </Text>
      </PageShell>
    </>
  );
}
