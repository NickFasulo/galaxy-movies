import type { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, SimpleGrid, Text, Badge, Flex } from '@chakra-ui/react'
import { streamingProviders } from '../../utils/tmdb'
import { detectRegion } from '../../utils/region'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import BackButton from '../../components/BackButton'

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return { props: { region: detectRegion(req) } }
}

export default function StreamingIndex({ region }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/streaming`
  const title = 'Where to Watch Movies by Streaming Service'
  const description = 'Browse movies by streaming service, including Netflix, Amazon Prime Video, Hulu, JioHotstar, ZEE5, SonyLIV, and more.'
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({ title, subtitle: description }).toString()}`

  const providers = Object.entries(streamingProviders).map(([key, provider]) => ({
    key,
    title: provider.title,
    label: provider.title.replace(' Movies', ''),
    regions: provider.regions
  }))

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    url: canonicalUrl,
    numberOfItems: providers.length,
    itemListElement: providers.map((provider, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'WebPage',
        name: provider.title,
        url: `${siteUrl}/streaming/${provider.key}`
      }
    }))
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Streaming', url: canonicalUrl }
  ]

  const indiaProviders = providers.filter((p) => !p.regions || p.regions.includes('IN'))
  const usProviders = providers.filter((p) => !p.regions || p.regions.includes('US'))

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${title} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListData).replace(/</g, '\\u003c')
          }}
        />
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>

          {region === 'IN' && (
            <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
              Looking for streaming options in India specifically? See our{' '}
              <Link href='/streaming-in-india'>streaming in India guide</Link>.
            </Text>
          )}

          <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
            Want to see what&apos;s new? Check out{' '}
            <Link href='/new-on-streaming'>new releases streaming now</Link>.
          </Text>

          <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
            Looking for TV shows?{' '}
            <Link href='/tv'>Browse shows by streaming service and genre</Link>.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Available in the United States</Heading>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
            {usProviders.map((provider) => (
              <Link key={provider.key} href={`/streaming/${provider.key}`}>
                <Flex
                  align='center'
                  justify='center'
                  p={4}
                  borderRadius='0.5rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                  h='100%'
                >
                  <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
                  {provider.regions && (
                    <Badge ml={2} colorPalette='gray' fontSize='2xs'>US only</Badge>
                  )}
                </Flex>
              </Link>
            ))}
          </SimpleGrid>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Available in India</Heading>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
            {indiaProviders.map((provider) => (
              <Link key={provider.key} href={`/streaming/${provider.key}`}>
                <Flex
                  align='center'
                  justify='center'
                  p={4}
                  borderRadius='0.5rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                  h='100%'
                >
                  <Text fontWeight='medium' textAlign='center'>{provider.label}</Text>
                </Flex>
              </Link>
            ))}
          </SimpleGrid>

          <Text textAlign='center' mt={10} color='gray.400'>
            Availability changes by region and over time. Check each movie page for current provider information.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  );
}
