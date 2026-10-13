import type { GetServerSidePropsContext } from 'next'
import Link from 'next/link'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../utils/tmdb'
import { setSwrCache } from '../../utils/ssr'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  setSwrCache(res, 86400, 604800)
  return { props: {} }
}

export default function LeavingIndex() {
  const canonicalUrl = `${SITE_URL}/leaving`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = `What's New and Leaving Streaming (${monthLabel})`
  const description = `Dated lists of movies and shows added to and leaving each major streaming service in ${monthLabel}, plus what's coming next — tracked daily from US catalogs.`

  const providers = Object.keys(PROVIDER_NAME_MATCH)
    .filter((key) => streamingProviders[key])
    .map((key) => ({ key, label: streamingProviders[key].title.replace(' Movies', '') }))

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: providers.map((p) => ({
      '@type': 'WebPage',
      name: `What's new and leaving ${p.label}`,
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
          { name: 'Added & Leaving', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Also see <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>new releases streaming now</Link>.
        </Text>
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
      </PageShell>
    </>
  );
}
