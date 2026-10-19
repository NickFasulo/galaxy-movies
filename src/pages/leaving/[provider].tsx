import { Fragment } from 'react'
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../features/catalog/tmdb'
import { getMonthlyChanges, getProviderChanges } from '../../features/catalog/streamingChanges'
import { setSwrCache } from '../../lib/http'
import { itemListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import type { MediaType } from '../../types/tmdb'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(date: string) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return date
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`
}

interface ListedTitle {
  tmdbId: number | null
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
  departed: DayGroup[]
  leavingSoon: DayGroup[]
  trackedProviders: { key: string; label: string }[]
  dataError?: boolean
}

type DatedInput = { date: string; tmdbId: number | null; tmdbType: MediaType; title: string; year?: number | null; season?: number | null }

function groupDays(items: DatedInput[], order: 'asc' | 'desc'): DayGroup[] {
  const map = new Map<string, ListedTitle[]>()
  for (const t of items) {
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
    let departed: DayGroup[] = []
    let leavingSoon: DayGroup[] = []
    let updatedAt: number | null = monthly?.updatedAt ?? null
    let month = monthly?.month ?? today.slice(0, 7)

    if (monthly) {
      departed = groupDays(monthly.departed, 'desc')
      leavingSoon = groupDays((monthly.leavingSoon || []).filter((t) => t.date >= today), 'asc')
    } else {
      const fallback = (await getProviderChanges([slug]))[slug]
      if (fallback) {
        updatedAt = fallback.updatedAt
        month = new Date(fallback.updatedAt).toISOString().slice(0, 7)
        const stamp = new Date(fallback.updatedAt).toISOString().split('T')[0]
        departed = groupDays(fallback.left.map((t) => ({ ...t, date: stamp })), 'desc')
        leavingSoon = groupDays((fallback.leavingSoon || []).filter((t) => t.date >= today), 'asc')
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
        departed,
        leavingSoon
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
        departed: [],
        leavingSoon: [],
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
                <Fragment key={`${t.tmdbType}-${t.tmdbId ?? t.label}`}>
                  {i > 0 && <Text as='span' color='gray.600'>·</Text>}
                  {t.tmdbId ? (
                    <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
                      <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>{t.label}</Text>
                    </Link>
                  ) : (
                    <Text as='span'>{t.label}</Text>
                  )}
                </Fragment>
              ))}
            </Flex>
          </Box>
        ))
      )}
    </Box>
  )
}

export default function LeavingProvider({ provider, providerLabel, monthLabel, monthShort, updatedLabel, departed, leavingSoon, trackedProviders, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/leaving/${provider}`
  const title = `Leaving ${providerLabel} in ${monthLabel}`
  const description = `Movies and shows that left ${providerLabel} in ${monthLabel} — the dated departures list, updated daily from the US catalog.`

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: departed
      .flatMap((group) => group.items)
      .filter((t) => t.tmdbId)
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
          { name: 'Leaving', url: `${SITE_URL}/leaving` },
          { name: providerLabel, url: canonicalUrl }
        ]}
      >
        <link rel='alternate' type='application/rss+xml' title='Galaxy Movies streaming changes' href={`${SITE_URL}/leaving.xml`} />
      </PageHead>
      <PageShell title={title} description={description} withBackButton>
        {updatedLabel && (
          <Text mt={2} color='gray.500' fontSize='sm'>Updated {updatedLabel}. {providerLabel} US catalog.</Text>
        )}
        <Text mt={2} color='gray.500' fontSize='sm'>
          See <Link href={`/new-on-streaming/${provider}`} style={{ textDecoration: 'underline' }}>what&apos;s new on {providerLabel}</Link>, browse{' '}
          <Link href={`/streaming/${provider}`} style={{ textDecoration: 'underline' }}>the full catalog</Link>, or check{' '}
          <Link href={`/this-month/${provider}`} style={{ textDecoration: 'underline' }}>whether it&apos;s worth it this month</Link>.
        </Text>

        {dataError ? (
          <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <>
            <DaySection heading='Leaving soon' groups={leavingSoon} emptyText='No scheduled departures announced yet.' />
            <DaySection heading={`Left in ${monthShort}`} groups={departed} emptyText={`No departures tracked yet in ${monthShort}.`} />
          </>
        )}

        <Heading as='h2' size='sm' mt={12} mb={3}>Leaving other services</Heading>
        <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm'>
          {trackedProviders.filter((p) => p.key !== provider).map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && <Text as='span' color='gray.600'>·</Text>}
              <Link href={`/leaving/${p.key}`} style={{ textDecoration: 'underline' }}>{p.label}</Link>
            </Fragment>
          ))}
        </Flex>

        <Text maxW='42rem' mt={10} color='gray.500' fontSize='sm'>
          &quot;Leaving soon&quot; dates come from the service&apos;s announced schedule and can shift; &quot;left&quot; dates mark the day a
          title was detected out of the tracked catalog. List covers the US catalog and updates daily.
        </Text>
        <Text mt={4} color='gray.500' fontSize='sm'>
          <Link href={`/widgets?provider=${provider}`} style={{ textDecoration: 'underline' }}>Embed this list on your site</Link> — free, updates daily.
        </Text>
      </PageShell>
    </>
  );
}
