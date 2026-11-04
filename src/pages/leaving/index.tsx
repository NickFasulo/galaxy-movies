import type { GetServerSidePropsContext } from 'next'
import Link from 'next/link'
import { Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { secondaryButton } from '../../theme'
import { PROVIDER_NAME_MATCH, streamingProviders, isProviderAvailableInRegion } from '../../features/catalog/tmdb'
import { getMonthlyChanges } from '../../features/catalog/streamingChanges'
import { setSwrCache } from '../../lib/http'
import { shortDate } from '../../lib/format/formatters'
import { itemListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'
import type { MediaType } from '../../types/tmdb'

const dayLabel = (date: string) => shortDate(date, date)

interface SoonItem {
  tmdbId: number | null
  tmdbType: MediaType
  label: string
  date: string
  providerKey: string
  providerLabel: string
}

interface Props {
  soon: SoonItem[]
  recent: SoonItem[]
  region: 'US' | 'IN'
}

const providerKeysFor = (region: 'US' | 'IN') =>
  region === 'IN'
    ? Object.keys(streamingProviders).filter((key) => isProviderAvailableInRegion(key, 'IN'))
    : Object.keys(PROVIDER_NAME_MATCH).filter((key) => streamingProviders[key])

export function leavingIndexServerSideProps(region: 'US' | 'IN' = 'US') {
  return async function getServerSideProps({ res }: GetServerSidePropsContext) {
    setSwrCache(res, 86400, 604800)
    const keys = providerKeysFor(region)
    const today = new Date().toISOString().split('T')[0]
    try {
      const monthlies = await getMonthlyChanges(keys.map((k) => (region === 'IN' ? `IN:${k}` : k)))
      const soon: SoonItem[] = []
      const recent: SoonItem[] = []
      for (const [monthlyKey, m] of Object.entries(monthlies)) {
        const key = monthlyKey.replace(/^IN:/, '')
        const providerLabel = streamingProviders[key]?.title.replace(' Movies', '') || key
        for (const t of m?.leavingSoon || []) {
          if (t.date >= today) {
            soon.push({
              tmdbId: t.tmdbId,
              tmdbType: t.tmdbType,
              label: `${t.title}${t.season ? ` (season ${t.season})` : ''}`,
              date: t.date,
              providerKey: key,
              providerLabel
            })
          }
        }
        // IN has no announced-departure feed — surface recent departures
        // instead so the index page still carries dated content.
        for (const t of m?.departed || []) {
          recent.push({
            tmdbId: t.tmdbId,
            tmdbType: t.tmdbType,
            label: `${t.title}${t.year ? ` (${t.year})` : ''}`,
            date: t.date,
            providerKey: key,
            providerLabel
          })
        }
      }
      soon.sort((a, b) => a.date.localeCompare(b.date))
      recent.sort((a, b) => b.date.localeCompare(a.date))
      return { props: { soon: soon.slice(0, 12), recent: region === 'IN' ? recent.slice(0, 16) : [], region } }
    } catch {
      return { props: { soon: [], recent: [], region } }
    }
  }
}

export const getServerSideProps = leavingIndexServerSideProps()

export default function LeavingIndex({ soon, recent, region }: Props) {
  const prefix = region === 'IN' ? '/in' : ''
  const canonicalUrl = `${SITE_URL}${prefix}/leaving`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const title = region === 'IN'
    ? `What's Leaving Streaming Services in India (${monthLabel})`
    : `What's Leaving Streaming Services (${monthLabel})`
  const description = `Dated lists of movies and shows leaving each major streaming service${region === 'IN' ? ' in India' : ''} in ${monthLabel}: tracked daily from ${region === 'IN' ? 'India' : 'US'} catalogs.`

  const providers = providerKeysFor(region)
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', '') }))

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: providers.map((p) => ({
      '@type': 'WebPage',
      name: `Leaving ${p.label}`,
      url: `${SITE_URL}${prefix}/leaving/${p.key}`
    }))
  })

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        hreflangAlternates={{ us: `${SITE_URL}/leaving`, in: `${SITE_URL}/in/leaving` }}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Leaving', url: canonicalUrl }
        ]}
      >
        {region === 'US' && <link rel='alternate' type='application/rss+xml' title='Galaxy Movies streaming changes' href={`${SITE_URL}/leaving.xml`} />}
      </PageHead>
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Also see <Link href={`${prefix}/new-on-streaming`} style={{ textDecoration: 'underline' }}>what&apos;s new on each service</Link> or{' '}
          <Link href={`${prefix}/this-month`} style={{ textDecoration: 'underline' }}>which service is worth it this month</Link>.
        </Text>

        {soon.length > 0 && (
          <Box mt={10}>
            <Heading as='h2' size='md' mb={4}>Leaving soon</Heading>
            {soon.map((t, i) => (
              <Flex key={`${t.providerKey}-${t.tmdbType}-${t.tmdbId ?? i}`} fontSize='sm' mb={2} align='baseline' wrap='wrap' columnGap={2}>
                <Text color='gray.400' flexShrink={0} w='52px'>{dayLabel(t.date)}</Text>
                {t.tmdbId ? (
                  <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`}>
                    <Text as='span' _hover={{ textDecoration: 'underline' }}>{t.label}</Text>
                  </Link>
                ) : (
                  <Text as='span'>{t.label}</Text>
                )}
                <Text as='span' color='gray.500'>
                  on <Link href={`${prefix}/leaving/${t.providerKey}`} style={{ textDecoration: 'underline' }}>{t.providerLabel}</Link>
                </Text>
              </Flex>
            ))}
            <Text color='gray.500' fontSize='xs' mt={3}>
              Announced departure dates: services sometimes shift them. Full preview is limited; per-service pages update daily.
            </Text>
          </Box>
        )}

        {recent.length > 0 && (
          <Box mt={10}>
            <Heading as='h2' size='md' mb={4}>Left recently</Heading>
            {recent.map((t, i) => (
              <Flex key={`${t.providerKey}-${t.tmdbType}-${t.tmdbId ?? i}`} fontSize='sm' mb={2} align='baseline' wrap='wrap' columnGap={2}>
                <Text color='gray.400' flexShrink={0} w='52px'>{dayLabel(t.date)}</Text>
                {t.tmdbId ? (
                  <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`}>
                    <Text as='span' _hover={{ textDecoration: 'underline' }}>{t.label}</Text>
                  </Link>
                ) : (
                  <Text as='span'>{t.label}</Text>
                )}
                <Text as='span' color='gray.500'>
                  left <Link href={`${prefix}/leaving/${t.providerKey}`} style={{ textDecoration: 'underline' }}>{t.providerLabel}</Link>
                </Text>
              </Flex>
            ))}
          </Box>
        )}

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Pick a service</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {providers.map((p) => (
            <LinkTile key={p.key} href={`${prefix}/leaving/${p.key}`}>
              <Text fontWeight='medium' textAlign='center'>{p.label}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
        <Text textAlign='center' mt={10} color='gray.400'>
          {region === 'IN' ? 'India' : 'US'} catalogs, updated daily. Departure dates mark when a title was detected leaving the service.
        </Text>
        {region === 'US' && (
          <>
            <Text textAlign='center' mt={4} color='gray.500' fontSize='sm'>
              Write about streaming? Embed these lists on your site (free), or subscribe to the RSS feed:
            </Text>
            <Flex wrap='wrap' gap={2} mt={4} justify='center'>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/reports/streaming-churn'>Churn report</Link>
              </Button>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/widgets'>Embed these lists</Link>
              </Button>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/leaving.xml'>RSS feed</Link>
              </Button>
            </Flex>
          </>
        )}
      </PageShell>
    </>
  );
}
