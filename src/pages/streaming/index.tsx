import type { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import Link from 'next/link'
import { Heading, SimpleGrid, Text, Badge } from '@chakra-ui/react'
import { streamingProviders } from '../../utils/tmdb'
import { detectRegion } from '../../utils/region'
import { setSwrCache } from '../../utils/ssr'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  setSwrCache(res, 86400, 604800)
  return { props: { region: detectRegion(req) } }
}

export default function StreamingIndex({ region }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const canonicalUrl = `${SITE_URL}/streaming`
  const title = 'Where to Watch Movies by Streaming Service'
  const description = 'Browse movies by streaming service, including Netflix, Amazon Prime Video, Hulu, JioHotstar, ZEE5, SonyLIV, and more.'

  const providers = Object.entries(streamingProviders).map(([key, provider]) => ({
    key,
    title: provider.title,
    label: provider.title.replace(' Movies', ''),
    regions: provider.regions
  }))

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: providers.map((provider) => ({
      '@type': 'WebPage',
      name: provider.title,
      url: `${SITE_URL}/streaming/${provider.key}`
    }))
  })

  const indiaProviders = providers.filter((p) => !p.regions || p.regions.includes('IN'))
  const usProviders = providers.filter((p) => !p.regions || p.regions.includes('US'))

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Streaming', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {region === 'IN' && (
          <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
            Looking for streaming options in India specifically? See our{' '}
            <Link href='/streaming-in-india' style={{ textDecoration: 'underline' }}>streaming in India guide</Link>.
          </Text>
        )}

        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Want to see what&apos;s new? Check out{' '}
          <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>new releases streaming now</Link>, or track{' '}
          <Link href='/leaving' style={{ textDecoration: 'underline' }}>what&apos;s being added to and leaving each service</Link>.
        </Text>

        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Looking for TV shows?{' '}
          <Link href='/tv' style={{ textDecoration: 'underline' }}>Browse shows by streaming service and genre</Link>.
        </Text>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Available in the United States</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {usProviders.map((provider) => (
            <LinkTile key={provider.key} href={`/streaming/${provider.key}`}>
              <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
              {provider.regions && (
                <Badge ml={2} colorPalette='gray' fontSize='2xs'>US only</Badge>
              )}
            </LinkTile>
          ))}
        </SimpleGrid>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Available in India</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {indiaProviders.map((provider) => (
            <LinkTile key={provider.key} href={`/streaming/${provider.key}`}>
              <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>

        <Text textAlign='center' mt={10} color='gray.400'>
          Availability changes by region and over time. Check each movie page for current provider information.
        </Text>
      </PageShell>
    </>
  );
}
