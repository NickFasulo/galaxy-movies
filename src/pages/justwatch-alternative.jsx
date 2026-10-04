import Head from 'next/head'
import Link from 'next/link'
import {
  Box,
  Heading,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react'
import { fetchDiscoverMovies } from '../utils/tmdb'
import MovieGrid from '../components/MovieGrid'
import BreadcrumbSchema from '../components/BreadcrumbSchema'
import HreflangTags from '../components/HreflangTags'
import BackButton from '../components/BackButton'

export async function getStaticProps() {
  try {
    const data = await fetchDiscoverMovies({ category: 'popular' })
    return {
      props: { movies: data.results.slice(0, 10) },
      revalidate: 86400
    }
  } catch (error) {
    console.error(error)
    return {
      props: { movies: [], dataError: true },
      revalidate: 3600
    }
  }
}

const COMPARISON_ROWS = [
  { feature: 'Where-to-watch availability', galaxy: 'Yes — stream, rent and buy options on every movie and TV page', justwatch: 'Yes — the largest availability database, ~140 countries' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes — Galaxy Bot picks by mood, group, time limit and availability', justwatch: 'No' },
  { feature: 'AI-generated synopses', galaxy: 'Yes — instant objective summary on every movie', justwatch: 'No' },
  { feature: 'Movies and TV shows', galaxy: 'Yes', justwatch: 'Yes' },
  { feature: 'Curated lists', galaxy: 'Yes — themed lists updated regularly', justwatch: 'Limited' },
  { feature: 'Watchlist', galaxy: 'Yes', justwatch: 'Yes' },
  { feature: 'Rent/buy price comparison', galaxy: 'Basic provider listing', justwatch: 'Yes — deepest price coverage' },
  { feature: 'Mobile apps', galaxy: 'Web only', justwatch: 'iOS and Android' },
  { feature: 'Account required', galaxy: 'No', justwatch: 'No' },
  { feature: 'Price', galaxy: 'Free', justwatch: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'Is Galaxy Movies a good JustWatch alternative?',
    answer: 'If you mainly want to decide what to watch, yes. Galaxy Movies combines where-to-watch lookup with Galaxy Bot, an AI assistant that recommends movies and shows by mood, who you are watching with, and how much time you have. If you need availability for a niche country or deep rent/buy price comparison, JustWatch covers more ground.'
  },
  {
    question: 'Is Galaxy Movies free?',
    answer: 'Yes. Browsing, watch-provider lookup, curated lists and the Galaxy Bot assistant are free, and no account is required.'
  },
  {
    question: 'Does Galaxy Movies cover TV shows?',
    answer: 'Yes. Galaxy Movies covers both movies and TV shows, including streaming availability, trending titles, and genre and provider browsing for each.'
  },
  {
    question: 'Where does Galaxy Movies get its data?',
    answer: 'Movie, TV and watch-provider data comes from The Movie Database (TMDB). Availability varies by country and changes over time, so always confirm on the provider before you commit.'
  }
]

export default function JustWatchAlternative({ movies, dataError }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/justwatch-alternative`
  const title = 'A Free JustWatch Alternative for Deciding What to Watch'
  const description = 'Galaxy Movies is a free JustWatch alternative that pairs where-to-watch availability with an AI assistant that helps you decide what to watch. Movies and TV shows, no account needed.'
  const featuredPoster = movies?.[0]?.poster_path
    ? `https://image.tmdb.org/t/p/w500${movies[0].poster_path}`
    : null
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title,
    subtitle: description,
    ...(featuredPoster ? { poster: featuredPoster } : {})
  }).toString()}`

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer }
    }))
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'JustWatch Alternative', url: canonicalUrl }
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
            __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c')
          }}
        />
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>

          <Text maxW='60rem' mt={8}>
            JustWatch answers one question extremely well: <em>where</em> can I watch this? Galaxy Movies is built
            for the question that comes first — <em>what</em> should I watch tonight? It combines streaming
            availability with Galaxy Bot, a conversational assistant that recommends titles based on your mood,
            who you are watching with, and how much time you have.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs JustWatch</Heading>
          <TableContainer border='1px solid' borderColor='whiteAlpha.300' borderRadius='0.75rem'>
            <Table variant='simple' size='sm'>
              <Thead>
                <Tr>
                  <Th color='gray.400' borderColor='whiteAlpha.300'>Feature</Th>
                  <Th color='gray.400' borderColor='whiteAlpha.300'>Galaxy Movies</Th>
                  <Th color='gray.400' borderColor='whiteAlpha.300'>JustWatch</Th>
                </Tr>
              </Thead>
              <Tbody>
                {COMPARISON_ROWS.map(({ feature, galaxy, justwatch }) => (
                  <Tr key={feature}>
                    <Td borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Td>
                    <Td borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Td>
                    <Td borderColor='whiteAlpha.200' whiteSpace='normal'>{justwatch}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where JustWatch is still the better tool</Heading>
          <Text maxW='60rem'>
            JustWatch indexes more streaming providers across more countries than any other guide, and its rent/buy
            price comparison is the deepest around. If you need availability in a country Galaxy Movies does not
            cover, or you are comparing rental prices across storefronts, use JustWatch. Galaxy Movies is a
            discovery tool first, not a pricing database.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            Instead of filtering a catalog, you describe the situation — a genre, a mood, a runtime limit, who is
            in the room — and Galaxy Bot narrows it to a pick, with an instant AI synopsis so you can sanity-check
            it before committing. Every movie and show page shows where it is streaming, and the site is built for
            speed: search and page transitions stay under a blink.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming'>streaming service</Link>, <Link href='/genre/action'>genre</Link>, or{' '}
            <Link href='/lists'>curated list</Link>, check <Link href='/new-on-streaming'>what is new on streaming</Link>,
            or see the <Link href='/streaming-in-india'>India streaming guide</Link> for Bollywood, Tamil and Telugu
            coverage.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Frequently asked questions</Heading>
          {FAQ_ITEMS.map(({ question, answer }) => (
            <Box key={question} mb={6}>
              <Heading as='h3' size='sm' mb={2}>{question}</Heading>
              <Text maxW='60rem' color='gray.300'>{answer}</Text>
            </Box>
          ))}

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Popular movies to watch now</Heading>
          {dataError ? (
            <Text mt={4}>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : (
            <MovieGrid movies={movies} />
          )}

          <Text textAlign='center' mt={8} color='gray.400'>
            Availability varies by country and changes over time — check each title page for current providers.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
