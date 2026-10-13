import { Fragment } from 'react'
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../utils/tmdb'
import { getMonthlyChanges, getProviderChanges } from '../../utils/streamingChanges'
import { setSwrCache } from '../../utils/ssr'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import type { MediaType } from '../../types/tmdb'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(date: string) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return date
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`
}

interface ListedTitle {
  tmdbId: number
  tmdbType: MediaType
  label: string
}

interface DayGroup {
  date: string
  items: ListedTitle[]
}

interface Props {
  provider: string
  providerLabel: string
  monthLabel: string
  monthShort: string
  updatedLabel: string | null
  coming: DayGroup[]
  arrived: DayGroup[]
  departed: DayGroup[]
  trackedProviders: { key: string; label: string }[]
  dataError?: boolean
}

type DatedInput = { date: string; tmdbId: number | null; tmdbType: MediaType; title: string; year?: number | null; season?: number | null }

function groupDays(items: DatedInput[], order: 'asc' | 'desc'): DayGroup[] {
  const map = new Map<string, ListedTitle[]>()
  for (const t of items) {
    if (!t.tmdbId) continue
    const item: ListedTitle = {
      tmdbId: t.tmdbId,
      tmdbType: t.tmdbType,
      label: `${t.title}${t.year ? ` (${t.year})` : ''}${t.season ? ` (season ${t.season})` : ''}`
    }
    const list = map.get(t.date) || []
    list.push(item)
    map.set(t.date, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (order === 'desc' ? b.localeCompare(a) : a.localeCompare(b)))
    .map(([date, items]) => ({ date, items }))
}

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<Props>> {
  const slug = params?.provider ?? ''
  const provider = streamingProviders[slug]
  if (!provider || !PROVIDER_NAME_MATCH[slug]) return { notFound: true }

  const providerLabel = provider.title.replace(' Movies', '')
  const trackedProviders = Object.keys(PROVIDER_NAME_MATCH)
    .filter((key) => streamingProviders[key])
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', '') }))

  const today = new Date().toISOString().split('T')[0]
  const base: Pick<Props, 'provider' | 'providerLabel' | 'trackedProviders'> = {
    provider: slug,
    providerLabel,
    trackedProviders
  }

  try {
    const monthly = (await getMonthlyChanges([slug]))[slug]
    let coming: DayGroup[] = []
    let arrived: DayGroup[] = []
    let departed: DayGroup[] = []
    let updatedAt: number | null = monthly?.updatedAt ?? null
    let month = monthly?.month ?? today.slice(0, 7)

    if (monthly) {
      coming = groupDays(monthly.coming, 'asc')
      arrived = groupDays(monthly.arrived, 'desc')
      departed = groupDays(monthly.departed, 'desc')
    } else {
      const fallback = (await getProviderChanges([slug]))[slug]
      if (fallback) {
        updatedAt = fallback.updatedAt
        month = new Date(fallback.updatedAt).toISOString().slice(0, 7)
        const stamp = new Date(fallback.updatedAt).toISOString().split('T')[0]
        coming = groupDays(fallback.coming, 'asc')
        arrived = groupDays(fallback.added.map((t) => ({ ...t, date: stamp })), 'desc')
        departed = groupDays(fallback.left.map((t) => ({ ...t, date: stamp })), 'desc')
      }
    }

    const [year, monthNum] = month.split('-').map(Number)
    setSwrCache(res, 21600)
    return {
      props: {
        ...base,
        monthLabel: `${MONTHS[monthNum - 1]} ${year}`,
        monthShort: MONTHS_SHORT[monthNum - 1],
        updatedLabel: updatedAt ? new Date(updatedAt).toISOString().split('T')[0] : null,
        coming,
        arrived,
        departed
      }
    }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return {
      props: {
        ...base,
        monthLabel: `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`,
        monthShort: MONTHS_SHORT[Number(today.slice(5, 7)) - 1],
        updatedLabel: null,
        coming: [],
        arrived: [],
        departed: [],
        dataError: true
      }
    }
  }
}

function DaySection({ heading, groups, emptyText }: { heading: string; groups: DayGroup[]; emptyText: string }) {
  return (
    <Box mt={10}>
      <Heading as='h2' size='md' mb={4}>{heading}</Heading>
      {groups.length === 0 ? (
        <Text color='gray.500' fontSize='sm'>{emptyText}</Text>
      ) : (
        groups.map((group) => (
          <Box key={group.date} mb={4}>
            <Text fontSize='sm' color='gray.400' mb={1}>{dayLabel(group.date)}</Text>
            <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm' color='whiteAlpha.900'>
              {group.items.map((t, i) => (
                <Fragment key={`${t.tmdbType}-${t.tmdbId}`}>
                  {i > 0 && <Text as='span' color='gray.600'>·</Text>}
                  <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
                    <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>{t.label}</Text>
                  </Link>
                </Fragment>
              ))}
            </Flex>
          </Box>
        ))
      )}
    </Box>
  )
}

export default function LeavingProvider({ provider, providerLabel, monthLabel, monthShort, updatedLabel, coming, arrived, departed, trackedProviders, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/leaving/${provider}`
  const title = `What's New and Leaving ${providerLabel} (${monthLabel})`
  const description = `Movies and shows added to and leaving ${providerLabel} in ${monthLabel}, plus what's coming next — tracked daily from the US catalog.`

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: [...arrived, ...coming]
      .flatMap((group) => group.items)
      .slice(0, 20)
      .map((t) => ({
        '@type': t.tmdbType === 'tv' ? 'TVSeries' : 'Movie',
        name: t.label,
        url: `${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`
      }))
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
          { name: 'Added & Leaving', url: `${SITE_URL}/leaving` },
          { name: providerLabel, url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {updatedLabel && (
          <Text mt={2} color='gray.500' fontSize='sm'>Updated {updatedLabel}. {providerLabel} US catalog.</Text>
        )}
        <Text mt={2} color='gray.500' fontSize='sm'>
          Browse <Link href={`/streaming/${provider}`} style={{ textDecoration: 'underline' }}>everything currently on {providerLabel}</Link> or see{' '}
          <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>new releases across all services</Link>.
        </Text>

        {dataError ? (
          <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <>
            <DaySection heading='Coming soon' groups={coming} emptyText={`No upcoming ${providerLabel} releases tracked yet.`} />
            <DaySection heading={`Added in ${monthShort}`} groups={arrived} emptyText={`No additions tracked yet in ${monthShort}.`} />
            <DaySection heading={`Left in ${monthShort}`} groups={departed} emptyText={`No departures tracked yet in ${monthShort}.`} />
          </>
        )}

        <Heading as='h2' size='sm' mt={12} mb={3}>Other services</Heading>
        <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm'>
          {trackedProviders.filter((p) => p.key !== provider).map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && <Text as='span' color='gray.600'>·</Text>}
              <Link href={`/leaving/${p.key}`} style={{ textDecoration: 'underline' }}>{p.label}</Link>
            </Fragment>
          ))}
        </Flex>

        <Text maxW='42rem' mt={10} color='gray.500' fontSize='sm'>
          Arrival dates come from the service&apos;s release schedule where available. &quot;Left&quot; dates mark the day a title was
          detected out of the tracked catalog — official removal dates aren&apos;t published by all services. List covers the US catalog and updates daily.
        </Text>
      </PageShell>
    </>
  );
}
