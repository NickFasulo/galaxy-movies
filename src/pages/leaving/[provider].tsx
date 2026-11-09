import { Fragment } from 'react'
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Button, Flex, Heading, Text } from '@chakra-ui/react'
import { secondaryButton } from '../../theme'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { PROVIDER_NAME_MATCH, streamingProviders, isProviderAvailableInRegion } from '../../features/catalog/tmdb'
import { getMonthlyChanges, getProviderChanges } from '../../features/catalog/streamingChanges'
import { getProviderLogosByKey } from '../../features/catalog/providerCatalog'
import ProviderLinkButtons from '../../features/catalog/components/ProviderLinkButtons'
import { setSwrCache } from '../../lib/http'
import { shortDate } from '../../lib/format/formatters'
import { itemListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import type { MediaType } from '../../types/tmdb'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dayLabel = (date: string) => shortDate(date, date)

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
  region: 'US' | 'IN'
  monthLabel: string
  monthShort: string
  updatedLabel: string | null
  departed: DayGroup[]
  leavingSoon: DayGroup[]
  trackedProviders: { key: string; label: string; logo: string | null }[]
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

// Region-pinning lets /in/leaving/{provider} serve the India diff — the
// monthly keys are just namespaced as `IN:{provider}` in Redis.
export function leavingProviderServerSideProps(region: 'US' | 'IN' = 'US') {
  return async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<Props>> {
    const slug = params?.provider ?? ''
    const provider = streamingProviders[slug]
    const tracked = region === 'IN' ? isProviderAvailableInRegion(slug, 'IN') : Boolean(PROVIDER_NAME_MATCH[slug])
    if (!provider || !tracked) return { notFound: true }

    const providerLabel = provider.title.replace(' Movies', '')
    const logos = await getProviderLogosByKey(region).catch(() => new Map<string, string>())
    const trackedProviders = (region === 'IN'
      ? Object.keys(streamingProviders).filter((key) => isProviderAvailableInRegion(key, 'IN'))
      : Object.keys(PROVIDER_NAME_MATCH).filter((key) => streamingProviders[key])
    ).map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', ''), logo: logos.get(key) ?? null }))

    const today = new Date().toISOString().split('T')[0]
    const base: Pick<Props, 'provider' | 'providerLabel' | 'region' | 'trackedProviders'> = {
      provider: slug,
      providerLabel,
      region,
      trackedProviders
    }

    try {
      const monthlyKey = region === 'IN' ? `IN:${slug}` : slug
      const monthly = (await getMonthlyChanges([monthlyKey]))[monthlyKey]
      let departed: DayGroup[] = []
      let leavingSoon: DayGroup[] = []
      let updatedAt: number | null = monthly?.updatedAt ?? null
      let month = monthly?.month ?? today.slice(0, 7)

      if (monthly) {
        departed = groupDays(monthly.departed, 'desc')
        leavingSoon = groupDays((monthly.leavingSoon || []).filter((t) => t.date >= today), 'asc')
      } else {
        const fallback = (await getProviderChanges([slug], { region }))[slug]
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
}

export const getServerSideProps = leavingProviderServerSideProps()

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

export default function LeavingProvider({ provider, providerLabel, region, monthLabel, monthShort, updatedLabel, departed, leavingSoon, trackedProviders, dataError }: Props) {
  const prefix = region === 'IN' ? '/in' : ''
  const regionLabel = region === 'IN' ? 'India' : 'US'
  const canonicalUrl = `${SITE_URL}${prefix}/leaving/${provider}`
  const title = `Leaving ${providerLabel}${region === 'IN' ? ' India' : ''} in ${monthLabel}`
  const description = `Movies and shows that left ${providerLabel}${region === 'IN' ? ' India' : ''} in ${monthLabel}: the dated departures list, updated daily from the ${regionLabel} catalog.`
  // A US diff page exists only for the Watchmode-tracked set — IN-only
  // providers self-reference en-IN + x-default instead.
  const hreflangAlternates = PROVIDER_NAME_MATCH[provider]
    ? { us: `${SITE_URL}/leaving/${provider}`, in: `${SITE_URL}/in/leaving/${provider}` }
    : { in: `${SITE_URL}/in/leaving/${provider}` }

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
        hreflangAlternates={hreflangAlternates}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Leaving', url: `${SITE_URL}${prefix}/leaving` },
          { name: providerLabel, url: canonicalUrl }
        ]}
      >
        {region === 'US' && <link rel='alternate' type='application/rss+xml' title='Galaxy Movies streaming changes' href={`${SITE_URL}/leaving.xml`} />}
        {region === 'US' && PROVIDER_NAME_MATCH[provider] && (
          <link rel='alternate' type='application/rss+xml' title={`${providerLabel} arrivals & departures`} href={`${SITE_URL}/api/rss/${provider}`} />
        )}
      </PageHead>
      <PageShell title={title} description={description} withBackButton>
        {updatedLabel && (
          <Text mt={2} color='gray.500' fontSize='sm'>Updated {updatedLabel}. {providerLabel} {regionLabel} catalog.</Text>
        )}
        <Flex wrap='wrap' gap={2} mt={4}>
          <Button asChild size='xs' {...secondaryButton}>
            <Link href={`${prefix}/new-on-streaming/${provider}`}>What&apos;s new on {providerLabel}</Link>
          </Button>
          <Button asChild size='xs' {...secondaryButton}>
            <Link href={`${prefix}/streaming/${provider}`}>Full catalog</Link>
          </Button>
          <Button asChild size='xs' {...secondaryButton}>
            <Link href={`${prefix}/this-month/${provider}`}>Worth it this month?</Link>
          </Button>
        </Flex>

        {dataError ? (
          <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
        ) : (
          <>
            <DaySection heading='Leaving soon' groups={leavingSoon} emptyText='No scheduled departures announced yet.' />
            <DaySection heading={`Left in ${monthShort}`} groups={departed} emptyText={`No departures tracked yet in ${monthShort}.`} />
          </>
        )}

        <Heading as='h2' size='sm' mt={12} mb={3}>Leaving other services</Heading>
        <ProviderLinkButtons providers={trackedProviders.filter((p) => p.key !== provider).map((p) => ({ ...p, href: `${prefix}/leaving/${p.key}` }))} />

        <Text maxW='42rem' mt={10} color='gray.500' fontSize='sm'>
          &quot;Leaving soon&quot; dates come from the service&apos;s announced schedule and can shift; &quot;left&quot; dates mark the day a
          title was detected out of the tracked catalog. List covers the {regionLabel} catalog and updates daily.
        </Text>
        {region === 'US' && (
          <Flex wrap='wrap' gap={2} mt={4}>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href={`/widgets?provider=${provider}`}>Embed this list on your site</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <a href={`/api/cal/${provider}`}>Subscribe to the calendar feed</a>
            </Button>
          </Flex>
        )}
      </PageShell>
    </>
  );
}
