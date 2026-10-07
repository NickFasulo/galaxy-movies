import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { streamingProviders, getProviderId, isProviderAvailableInRegion, fetchListMovies } from '../utils/tmdb'
import { detectRegion } from '../utils/region'
import { withTimeout } from '../utils/withTimeout'
import { getProviderChanges, type ProviderChanges } from '../utils/streamingChanges'
import { setSwrCache } from '../utils/ssr'
import { itemListSchema, titleItem } from '../utils/schema'
import { SITE_URL } from '../utils/site'
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
        const providerId = getProviderId(key, region)
        const data = await fetchListMovies({
          ...dateParams,
          with_watch_providers: providerId,
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

const CHANGE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatChangeDate(stamp: string | null | undefined) {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  if (!m) return ''
  return `${CHANGE_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}

function ChangeList({ label, items, showDate = false }: { label: string; items?: ChangeItem[]; showDate?: boolean }) {
  if (!items?.length) return null
  return (
    <Box mb={3}>
      <Text fontSize='sm' color='gray.400' mb={1}>{label}</Text>
      <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm' color='whiteAlpha.900'>
        {items.map((t, i) => (
          <Fragment key={`${t.tmdbType}-${t.tmdbId}-${t.date || t.title}`}>
            {i > 0 && <Text as='span' color='gray.600'>·</Text>}
            <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
              <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>
                {t.title}{t.year ? ` (${t.year})` : ''}{showDate && t.date ? ` — ${formatChangeDate(t.date)}` : ''}{t.season ? ` (season ${t.season})` : ''}
              </Text>
            </Link>
          </Fragment>
        ))}
      </Flex>
    </Box>
  )
}

export default function NewOnStreaming({ sections, changes = {}, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/new-on-streaming`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = `New Releases Streaming Now (${monthLabel})`
  const description = `Recently released movies currently streaming by service, updated regularly — including Netflix, Amazon Prime Video, and more.`

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
      />
      <PageShell withBackButton>
          <Heading as='h1' ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} ml={{ base: '1rem', md: '5rem' }} color='gray.400'>{description}</Text>

          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : sections.length === 0 ? (
            <Text mt={10} color='gray.500'>No recent releases found for your region right now.</Text>
          ) : (
            sections.map((section) => (
              <Box key={section.key} mt={10}>
                <Heading as='h2' size='md' mb={4} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                  <Link href={`/streaming/${section.key}`} style={{ textDecoration: 'underline' }}>{section.label}</Link>
                </Heading>
                <MovieGrid movies={section.movies} />
              </Box>
            ))
          )}

          {Object.keys(changes).length > 0 && (
            <Box mt={14}>
              <Heading as='h2' size='md' mb={6} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                Coming soon &amp; recently changed
              </Heading>
              <Box ml={{ base: 0, md: '5rem' }}>
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
