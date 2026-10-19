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

export interface TitleRef {
  tmdbId: number
  tmdbType: MediaType
  label: string
}

interface Props {
  provider: string
  providerLabel: string
  monthLabel: string
  arrivedCount: number
  departedCount: number
  comingCount: number
  topArrived: TitleRef[]
  topDeparted: TitleRef[]
  topComing: TitleRef[]
  trackedProviders: { key: string; label: string }[]
  dataError?: boolean
}

const toRef = (t: { tmdbId: number | null; tmdbType: MediaType; title: string; year?: number | null; season?: number | null }): TitleRef | null =>
  t.tmdbId
    ? {
        tmdbId: t.tmdbId,
        tmdbType: t.tmdbType,
        label: `${t.title}${t.year ? ` (${t.year})` : ''}${t.season ? ` (season ${t.season})` : ''}`
      }
    : null

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<Props>> {
  const slug = params?.provider ?? ''
  const provider = streamingProviders[slug]
  if (!provider || !PROVIDER_NAME_MATCH[slug]) return { notFound: true }

  const providerLabel = provider.title.replace(' Movies', '')
  const trackedProviders = Object.keys(PROVIDER_NAME_MATCH)
    .filter((key) => streamingProviders[key])
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', '') }))
  const today = new Date().toISOString().split('T')[0]
  const monthLabel = `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`
  const base = { provider: slug, providerLabel, trackedProviders, monthLabel }

  try {
    let monthly = (await getMonthlyChanges([slug]))[slug]
    if (!monthly) {
      const fallback = (await getProviderChanges([slug]))[slug]
      if (fallback) {
        const stamp = new Date(fallback.updatedAt).toISOString().split('T')[0]
        monthly = {
          source: fallback.source,
          month: stamp.slice(0, 7),
          updatedAt: fallback.updatedAt,
          arrived: fallback.added.map((t) => ({ ...t, tmdbId: t.tmdbId ?? 0, date: stamp, season: null })),
          coming: fallback.coming,
          departed: fallback.left.map((t) => ({ ...t, date: stamp }))
        }
      }
    }
    if (!monthly) {
      return { props: { ...base, arrivedCount: 0, departedCount: 0, comingCount: 0, topArrived: [], topDeparted: [], topComing: [] } }
    }

    const [year, monthNum] = monthly.month.split('-').map(Number)
    setSwrCache(res, 21600)
    return {
      props: {
        ...base,
        monthLabel: `${MONTHS[monthNum - 1]} ${year}`,
        arrivedCount: monthly.arrived.length,
        departedCount: monthly.departed.length,
        comingCount: monthly.coming.length,
        topArrived: monthly.arrived.slice(0, 10).map(toRef).filter((t): t is TitleRef => Boolean(t)),
        topDeparted: monthly.departed.slice(0, 10).map(toRef).filter((t): t is TitleRef => Boolean(t)),
        topComing: monthly.coming.slice(0, 10).map(toRef).filter((t): t is TitleRef => Boolean(t))
      }
    }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return {
      props: { ...base, arrivedCount: 0, departedCount: 0, comingCount: 0, topArrived: [], topDeparted: [], topComing: [], dataError: true }
    }
  }
}

function TitleRow({ items }: { items: TitleRef[] }) {
  return (
    <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm' color='whiteAlpha.900'>
      {items.map((t, i) => (
        <Fragment key={`${t.tmdbType}-${t.tmdbId}`}>
          {i > 0 && <Text as='span' color='gray.600'>·</Text>}
          <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
            <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>{t.label}</Text>
          </Link>
        </Fragment>
      ))}
    </Flex>
  )
}

export default function ThisMonthProvider({ provider, providerLabel, monthLabel, arrivedCount, departedCount, comingCount, topArrived, topDeparted, topComing, trackedProviders, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/this-month/${provider}`
  const title = `Is ${providerLabel} Worth It in ${monthLabel}?`
  const description = `${providerLabel} added ${arrivedCount} titles and lost ${departedCount} in ${monthLabel} — see the highlights and decide whether it's worth a month.`

  const net = arrivedCount - departedCount
  const verdict = dataError
    ? ''
    : arrivedCount === 0 && departedCount === 0
      ? `We haven't tracked enough ${providerLabel} catalog movement in ${monthLabel} to call it either way yet — the list updates daily, so check back soon.`
      : `${providerLabel} has added ${arrivedCount} title${arrivedCount === 1 ? '' : 's'} and lost ${departedCount} so far in ${monthLabel}` +
        `${net > 0 ? ` — a net gain of ${net}` : net < 0 ? ` — a net loss of ${-net}` : ' — dead even'}.` +
        (comingCount > 0 ? ` Another ${comingCount} release${comingCount === 1 ? ' is' : 's are'} still on the way.` : '')

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: topArrived.slice(0, 20).map((t) => ({
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
          { name: 'This Month', url: `${SITE_URL}/this-month` },
          { name: providerLabel, url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {dataError ? (
          <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <>
            <Text mt={2} color='gray.300' fontSize='md' maxW='42rem'>{verdict}</Text>

            {topArrived.length > 0 && (
              <Box mt={10}>
                <Heading as='h2' size='md' mb={3}>What arrived in {monthLabel}</Heading>
                <TitleRow items={topArrived} />
              </Box>
            )}
            {topComing.length > 0 && (
              <Box mt={8}>
                <Heading as='h2' size='md' mb={3}>Still coming</Heading>
                <TitleRow items={topComing} />
              </Box>
            )}
            {topDeparted.length > 0 && (
              <Box mt={8}>
                <Heading as='h2' size='md' mb={3}>What left</Heading>
                <TitleRow items={topDeparted} />
              </Box>
            )}

            <Text mt={8} color='gray.500' fontSize='sm'>
              See <Link href={`/new-on-streaming/${provider}`} style={{ textDecoration: 'underline' }}>everything new on {providerLabel}</Link>,{' '}
              <Link href={`/leaving/${provider}`} style={{ textDecoration: 'underline' }}>what left</Link>, or{' '}
              <Link href={`/streaming/${provider}`} style={{ textDecoration: 'underline' }}>browse the whole catalog</Link>.
            </Text>
          </>
        )}

        <Heading as='h2' size='sm' mt={12} mb={3}>Compare other services</Heading>
        <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm'>
          {trackedProviders.filter((p) => p.key !== provider).map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && <Text as='span' color='gray.600'>·</Text>}
              <Link href={`/this-month/${p.key}`} style={{ textDecoration: 'underline' }}>{p.label}</Link>
            </Fragment>
          ))}
        </Flex>

        <Text maxW='42rem' mt={10} color='gray.500' fontSize='sm'>
          Counts cover the tracked US catalog and update daily. A pickup month makes sense when the arrivals you want
          outweigh what&apos;s leaving — heavy watchers can rotate services month to month instead of stacking subscriptions.
        </Text>
      </PageShell>
    </>
  );
}
