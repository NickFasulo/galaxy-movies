import Head from 'next/head'
import Link from 'next/link'
import { Fragment } from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import BackButton from '../components/BackButton'
import BreadcrumbSchema from '../components/BreadcrumbSchema'
import HreflangTags from '../components/HreflangTags'
import { streamingProviders, getProviderId, isProviderAvailableInRegion, fetchListMovies } from '../utils/tmdb'
import { detectRegion } from '../utils/region'
import { withTimeout } from '../utils/withTimeout'
import { getProviderChanges } from '../utils/streamingChanges'

const NEW_RELEASE_WINDOW_DAYS = 45
const MOVIES_PER_PROVIDER = 6

export async function getServerSideProps({ req, res }) {
  const region = detectRegion(req)
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - NEW_RELEASE_WINDOW_DAYS)
  const dateParams = {
    'primary_release_date.gte': windowStart.toISOString().split('T')[0],
    'primary_release_date.lte': today.toISOString().split('T')[0],
    sort_by: 'primary_release_date.desc'
  }

  const availableProviders = Object.entries(streamingProviders)
    .filter(([key]) => isProviderAvailableInRegion(key, region))

  try {
    const results = await Promise.all(
      availableProviders.map(async ([key, provider]) => {
        const providerId = getProviderId(key, region)
        const data = await fetchListMovies({
          ...dateParams,
          with_watch_providers: providerId,
          watch_region: region
        })
        return { key, label: provider.title.replace(' Movies', ''), movies: (data.results || []).slice(0, MOVIES_PER_PROVIDER) }
      })
    )

    const sections = results.filter((section) => section.movies.length > 0)
    const changes = await withTimeout(
      getProviderChanges(sections.map((section) => section.key)),
      2000,
      {}
    ) || {}

    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400')
    return { props: { region, sections, changes } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { region, sections: [], dataError: true } }
  }
}

const CHANGE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatChangeDate(stamp) {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  if (!m) return ''
  return `${CHANGE_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}

function ChangeList({ label, items, showDate = false }) {
  if (!items?.length) return null
  return (
    <Box mb={3}>
      <Text fontSize='sm' color='gray.400' mb={1}>{label}</Text>
      <Flex wrap='wrap' columnGap={2} rowGap={1} fontSize='sm' color='whiteAlpha.900'>
        {items.map((t, i) => (
          <Fragment key={`${t.tmdbType}-${t.tmdbId}-${t.date || t.title}`}>
            {i > 0 && <Text as='span' color='gray.600'>·</Text>}
            <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} passHref>
              <Text as='span' _hover={{ textDecoration: 'underline' }} cursor='pointer'>
                {t.title}{t.year ? ` (${t.year})` : ''}{showDate && t.date ? ` — ${formatChangeDate(t.date)}` : ''}{t.season ? ` (season ${t.season})` : ''}
              </Text>
            </Link>
          </Fragment>
        ))}
      </Flex>
    </Box>
  )
}

export default function NewOnStreaming({ region, sections, changes = {}, dataError }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/new-on-streaming`
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const title = `New Releases Streaming Now (${monthLabel})`
  const description = `Recently released movies currently streaming by service, updated regularly — including Netflix, Amazon Prime Video, and more.`
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({ title, subtitle: description }).toString()}`

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    url: canonicalUrl,
    numberOfItems: sections.reduce((sum, section) => sum + section.movies.length, 0),
    itemListElement: sections.flatMap((section) => section.movies).slice(0, 20).map((movie, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Movie',
        name: movie.title,
        url: `${siteUrl}/movies/${movie.id}`,
        image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        datePublished: movie.release_date || undefined
      }
    }))
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'New on Streaming', url: canonicalUrl }
  ]

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
          <Heading as='h1' ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} ml={{ base: '1rem', md: '5rem' }} color='gray.400'>{description}</Text>

          {dataError ? (
            <Text mt={10}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : sections.length === 0 ? (
            <Text mt={10} color='gray.500'>No recent releases found for your region right now.</Text>
          ) : (
            sections.map((section) => (
              <Box key={section.key} mt={10}>
                <Heading as='h2' size='md' mb={4} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                  <Link href={`/streaming/${section.key}`}>{section.label}</Link>
                </Heading>
                <MovieGrid movies={section.movies} />
              </Box>
            ))
          )}

          {Object.keys(changes).length > 0 && (
            <Box mt={14}>
              <Heading as='h2' size='md' mb={6} ml={{ base: 0, md: '5rem' }} textAlign={{ base: 'center', md: 'left' }}>
                Coming soon &amp; recently changed
              </Heading>
              <Box ml={{ base: 0, md: '5rem' }}>
                {Object.entries(changes).map(([key, change]) => (
                  <Box key={key} mb={8}>
                    <Heading as='h3' size='sm' mb={3}>
                      <Link href={`/streaming/${key}`}>{change.source}</Link>
                    </Heading>
                    <ChangeList label='Coming soon' items={change.coming} showDate />
                    <ChangeList label='Just added' items={change.added} />
                    <ChangeList label='Left recently' items={change.left} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Text textAlign='center' mt={10} color='gray.400'>
            Showing movies released in the last {NEW_RELEASE_WINDOW_DAYS} days and currently available to stream. Availability changes by region and over time.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
