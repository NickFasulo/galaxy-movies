import type { GetServerSidePropsContext } from 'next'
import Link from 'next/link'
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../features/catalog/tmdb'
import { getMonthlyChanges } from '../../features/catalog/streamingChanges'
import { setSwrCache } from '../../lib/http'
import { itemListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'
import type { MediaType } from '../../types/tmdb'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (date: string) => {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : date
}

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
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  setSwrCache(res, 86400, 604800)
  const keys = Object.keys(PROVIDER_NAME_MATCH).filter((key) => streamingProviders[key])
  const today = new Date().toISOString().split('T')[0]
  try {
    const monthlies = await getMonthlyChanges(keys)
    const soon: SoonItem[] = []
    for (const [key, m] of Object.entries(monthlies)) {
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
    }
    soon.sort((a, b) => a.date.localeCompare(b.date))
    return { props: { soon: soon.slice(0, 12) } }
  } catch {
    return { props: { soon: [] } }
  }
}

export default function LeavingIndex({ soon }: Props) {
  const canonicalUrl = `${SITE_URL}/leaving`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = `What's Leaving Streaming Services (${monthLabel})`
  const description = `Dated lists of movies and shows leaving each major streaming service in ${monthLabel} — tracked daily from US catalogs.`

  const providers = Object.keys(PROVIDER_NAME_MATCH)
    .filter((key) => streamingProviders[key])
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', '') }))

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: providers.map((p) => ({
      '@type': 'WebPage',
      name: `Leaving ${p.label}`,
      url: `${SITE_URL}/leaving/${p.key}`
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
          { name: 'Leaving', url: canonicalUrl }
        ]}
      >
        <link rel='alternate' type='application/rss+xml' title='Galaxy Movies streaming changes' href={`${SITE_URL}/leaving.xml`} />
      </PageHead>
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Also see <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what&apos;s new on each service</Link> or{' '}
          <Link href='/this-month' style={{ textDecoration: 'underline' }}>which service is worth it this month</Link>.
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
                  on <Link href={`/leaving/${t.providerKey}`} style={{ textDecoration: 'underline' }}>{t.providerLabel}</Link>
                </Text>
              </Flex>
            ))}
            <Text color='gray.500' fontSize='xs' mt={3}>
              Announced departure dates — services sometimes shift them. Full preview is limited; per-service pages update daily.
            </Text>
          </Box>
        )}

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Pick a service</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {providers.map((p) => (
            <LinkTile key={p.key} href={`/leaving/${p.key}`}>
              <Text fontWeight='medium' textAlign='center'>{p.label}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
        <Text textAlign='center' mt={10} color='gray.400'>
          US catalogs, updated daily. Departure dates mark when a title was detected leaving the service.
        </Text>
        <Text textAlign='center' mt={4} color='gray.500' fontSize='sm'>
          Write about streaming?{' '}
          <Link href='/widgets' style={{ textDecoration: 'underline' }}>Embed these lists on your site — free</Link>.
          {' '}Or subscribe to the <Link href='/leaving.xml' style={{ textDecoration: 'underline' }}>RSS feed</Link>.
        </Text>
      </PageShell>
    </>
  );
}
