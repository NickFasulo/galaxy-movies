import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../features/catalog/tmdb'
import { getMonthlyChanges } from '../../features/catalog/streamingChanges'
import { setSwrCache } from '../../lib/http'
import { itemListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

interface ProviderStat {
  key: string
  label: string
  arrived: number
  departed: number
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<{ providers: ProviderStat[] }>> {
  const providers = Object.keys(PROVIDER_NAME_MATCH)
    .filter((key) => streamingProviders[key])
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', ''), arrived: 0, departed: 0 }))

  try {
    const monthly = await getMonthlyChanges(providers.map((p) => p.key))
    for (const p of providers) {
      p.arrived = monthly[p.key]?.arrived.length ?? 0
      p.departed = monthly[p.key]?.departed.length ?? 0
    }
  } catch (error) {
    console.error(error)
  }

  setSwrCache(res, 21600)
  return { props: { providers } }
}

export default function ThisMonthIndex({ providers }: { providers: ProviderStat[] }) {
  const canonicalUrl = `${SITE_URL}/this-month`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const title = `Which Streaming Service Is Worth It in ${monthLabel}?`
  const description = `Arrivals vs departures for every major US streaming service in ${monthLabel}: see which subscription earns its month before you pay for it.`

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: providers.map((p) => ({
      '@type': 'WebPage',
      name: `Is ${p.label} worth it in ${monthLabel}`,
      url: `${SITE_URL}/this-month/${p.key}`
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
          { name: 'This Month', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Rotate instead of stacking: pick up the service with the arrivals you want, drop the one that lost them.
        </Text>
        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Arrivals vs departures</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {providers.map((p) => (
            <LinkTile key={p.key} href={`/this-month/${p.key}`}>
              <Text fontWeight='medium' textAlign='center'>{p.label}</Text>
              <Text fontSize='sm' color='gray.400' textAlign='center'>
                +{p.arrived} / −{p.departed}
              </Text>
            </LinkTile>
          ))}
        </SimpleGrid>
        <Text textAlign='center' mt={10} color='gray.400'>
          US catalogs, updated daily. Counts cover titles tracked into and out of each service this month.
        </Text>
        <Text textAlign='center' mt={4} color='gray.500' fontSize='sm'>
          Want the dated lists? <Link href='/leaving' style={{ textDecoration: 'underline' }}>See what&apos;s new and leaving</Link>.
        </Text>
      </PageShell>
    </>
  );
}
