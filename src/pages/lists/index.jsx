import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, SimpleGrid, Text, Flex } from '@chakra-ui/react'
import { curatedLists } from '../../utils/curatedLists'
import { getGeneratedLists } from '../../utils/generatedLists'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import BackButton from '../../components/BackButton'

export async function getServerSideProps({ res }) {
  const generated = await getGeneratedLists()
  const generatedLists = Object.entries(generated).map(([slug, list]) => ({
    slug,
    title: list.title,
    tagline: list.tagline
  }))

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return { props: { generatedLists } }
}

export default function ListsIndex({ generatedLists = [] }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/lists`
  const title = 'Curated Movie Lists & Mood Picks'
  const description = 'Editorial movie collections for every mood — from cozy night-in picks to mind-bending thrillers and underrated 90s gems.'
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({ title, subtitle: description }).toString()}`

  const staticEntries = Object.entries(curatedLists).map(([slug, list]) => ({ slug, ...list }))
  const moodLists = staticEntries.filter((entry) => entry.group === 'mood')
  const curatedOnly = staticEntries.filter((entry) => entry.group === 'curated')
  const entries = [...staticEntries, ...generatedLists]

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    url: canonicalUrl,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'WebPage',
        name: entry.title,
        url: `${siteUrl}/lists/${entry.slug}`
      }
    }))
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Lists', url: canonicalUrl }
  ]

  const renderCard = (entry) => (
    <Link key={entry.slug} href={`/lists/${entry.slug}`}>
      <Flex
        direction='column'
        p={4}
        borderRadius='0.75rem'
        border='1px solid'
        borderColor='whiteAlpha.300'
        _hover={{ borderColor: 'whiteAlpha.600' }}
        h='100%'
      >
        <Text fontWeight='semibold'>{entry.title}</Text>
        <Text fontSize='sm' color='gray.400' mt={1}>{entry.tagline}</Text>
      </Flex>
    </Link>
  )

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

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Mood Picks</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {moodLists.map(renderCard)}
          </SimpleGrid>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Curated Collections</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {curatedOnly.map(renderCard)}
          </SimpleGrid>

          {generatedLists.length > 0 && (
            <>
              <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Fresh Collections</Heading>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                {generatedLists.map(renderCard)}
              </SimpleGrid>
            </>
          )}

          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
