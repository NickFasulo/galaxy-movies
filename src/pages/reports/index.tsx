import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import Panel from '../../components/Panel'
import { getLatestCharts, type ChartRow } from '../../features/catalog/charts'
import { setSwrCache } from '../../lib/http'
import { SITE_URL } from '../../lib/site'
import { secondaryButton } from '../../theme'

const CHART_ROWS = 10
const compact = (n: number) => n.toLocaleString('en-US')
const dollars = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`)

const CHART_DEFS: { key: string; title: string; media: 'movie' | 'tv'; fmt: (n: number) => string }[] = [
  { key: 'trending:movie', title: 'Trending movies', media: 'movie', fmt: (n) => `${compact(n)} watching` },
  { key: 'weekly:movie', title: 'Most watched movies', media: 'movie', fmt: (n) => `${compact(n)} plays` },
  { key: 'anticipated:movie', title: 'Most anticipated movies', media: 'movie', fmt: (n) => `${compact(n)} list adds` },
  { key: 'boxoffice:movie', title: 'Weekend box office', media: 'movie', fmt: dollars },
  { key: 'trending:tv', title: 'Trending shows', media: 'tv', fmt: (n) => `${compact(n)} watching` },
  { key: 'weekly:tv', title: 'Most watched shows', media: 'tv', fmt: (n) => `${compact(n)} plays` },
  { key: 'anticipated:tv', title: 'Most anticipated shows', media: 'tv', fmt: (n) => `${compact(n)} list adds` }
]

interface Props {
  traktDate: string | null
  traktBuckets: Record<string, ChartRow[]>
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  setSwrCache(res, 3600)
  try {
    const feed = await getLatestCharts()
    return { props: { traktDate: feed?.trakt?.date || null, traktBuckets: feed?.trakt?.buckets || {} } }
  } catch (error) {
    console.error(error)
    return { props: { traktDate: null, traktBuckets: {} } }
  }
}

export default function ReportsIndex({ traktDate, traktBuckets }: Props) {
  const canonicalUrl = `${SITE_URL}/reports`
  const title = 'Streaming data reports'
  const description = 'Reports built from Galaxy Movies\' daily tracking of streaming catalogs: churn, arrivals and departures across major services.'
  const charts = CHART_DEFS
    .map((def) => ({ ...def, rows: (traktBuckets[def.key] || []).slice(0, CHART_ROWS) }))
    .filter((def) => def.rows.length)

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Reports', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Box mt={8}>
          <Heading as='h2' size='md' mb={2}>
            <Link href='/reports/streaming-churn'>Streaming churn</Link>
          </Heading>
          <Text color='gray.300' maxW='42rem'>
            Monthly net adds and losses per service — which catalogs are growing and which are shrinking,
            measured from our own daily tracking.
          </Text>
        </Box>

        {charts.length > 0 && (
          <Box mt={10}>
            <Heading as='h2' size='md' mb={1}>Watch activity charts</Heading>
            <Text color='gray.500' fontSize='sm' mb={4}>
              Rankings via Trakt{traktDate ? `, data as of ${traktDate}` : ''} — refreshed daily.
            </Text>
            <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={4}>
              {charts.map((chart) => (
                <Panel key={chart.key} title={chart.title}>
                  {chart.rows.map((row) => (
                    <Flex key={row.r} align='baseline' gap={2} py={0.5} fontSize='sm'>
                      <Text as='span' color='gray.500' fontSize='xs' w={5} flexShrink={0} textAlign='right'>
                        {row.r}
                      </Text>
                      <Box flex='1' minW={0}>
                        {row.id ? (
                          <Link href={`/${chart.media === 'tv' ? 'tv' : 'movies'}/${row.id}`}>{row.t}</Link>
                        ) : (
                          row.t
                        )}
                        {row.y ? <Text as='span' color='gray.500' fontSize='xs'> {row.y}</Text> : null}
                      </Box>
                      {typeof row.n === 'number' && (
                        <Text as='span' color='gray.500' fontSize='xs' whiteSpace='nowrap'>
                          {chart.fmt(row.n)}
                        </Text>
                      )}
                    </Flex>
                  ))}
                </Panel>
              ))}
            </SimpleGrid>
            <Text color='gray.600' fontSize='xs' mt={3}>
              Watch activity rankings via Trakt. Galaxy Movies uses Trakt but is not endorsed or certified by Trakt.
            </Text>
          </Box>
        )}

        <Box mt={8}>
          <Heading as='h2' size='md' mb={3}>Data feeds</Heading>
          <Flex wrap='wrap' gap={2}>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/api/digital-releases'>Digital release dates</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/api/charts'>Demand charts (Netflix, Apple)</Link>
            </Button>
          </Flex>
          <Text color='gray.500' fontSize='sm' mt={3} maxW='42rem'>
            JSON feeds updated daily/weekly. Digital releases are confirmed US VOD dates; demand charts
            combine Netflix Top 10 viewership and Apple store rankings. Trakt charts above are shown
            here only — they are not part of the open feed.
          </Text>
        </Box>
        <Box mt={8}>
          <Heading as='h2' size='md' mb={3}>Related live lists</Heading>
          <Flex wrap='wrap' gap={2}>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/leaving'>What&apos;s leaving</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/this-month'>This month&apos;s verdicts</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/new-on-streaming'>New arrivals</Link>
            </Button>
          </Flex>
        </Box>
      </PageShell>
    </>
  );
}
