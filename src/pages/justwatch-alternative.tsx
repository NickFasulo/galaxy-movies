import type { InferGetStaticPropsType } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import {
  Box,
  Heading,
  Text,
  Table
} from '@chakra-ui/react'
import { fetchDiscoverMovies } from '../utils/tmdb'
import MovieGrid from '../components/MovieGrid'
import BreadcrumbSchema from '../components/BreadcrumbSchema'
import HreflangTags from '../components/HreflangTags'
import BackButton from '../components/BackButton'
import type { TmdbMovie } from '../types/tmdb'

export async function getStaticProps(): Promise<{ props: { movies: TmdbMovie[]; dataError?: boolean }; revalidate: number }> {
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
  { feature: 'Rent/buy price comparison', galaxy: 'Yes — per-title rental and purchase prices across stores, with the cheapest option highlighted', justwatch: 'Yes — deepest coverage across more stores and countries' },
  { feature: 'Deep links into each provider', galaxy: 'Yes — provider icons take you to the title itself, not the homepage', justwatch: 'Yes' },
  { feature: 'Free & ad-supported browsing', galaxy: 'Yes — a dedicated page of movies and shows streaming free with ads', justwatch: 'Yes' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes — Galaxy Bot picks by mood, group, time limit and availability', justwatch: 'No' },
  { feature: 'AI-generated synopses', galaxy: 'Yes — instant objective summary on every movie', justwatch: 'No' },
  { feature: 'Franchise collections', galaxy: 'Yes — every movie in a franchise, in order', justwatch: 'Yes' },
  { feature: 'Coming soon / leaving alerts', galaxy: 'Yes — weekly streaming changes digest plus coming-soon listings per service', justwatch: 'Yes — notifications with an account' },
  { feature: 'Region picker', galaxy: 'Yes — switch countries on any title page to see availability there', justwatch: 'Yes' },
  { feature: 'Movies and TV shows', galaxy: 'Yes', justwatch: 'Yes' },
  { feature: 'Curated lists', galaxy: 'Yes — themed lists updated regularly', justwatch: 'Limited' },
  { feature: 'Watchlist', galaxy: 'Yes', justwatch: 'Yes' },
  { feature: 'Mobile apps', galaxy: 'Web only', justwatch: 'iOS and Android' },
  { feature: 'Account required', galaxy: 'No', justwatch: 'No' },
  { feature: 'Price', galaxy: 'Free', justwatch: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'Is Galaxy Movies a good JustWatch alternative?',
    answer: 'Yes for most people. Galaxy Movies covers where to stream, rent and buy — including real rental and purchase prices and the cheapest option on each title — plus a dedicated free-with-ads page, franchise collections, and Galaxy Bot, an AI assistant that recommends by mood, who you are watching with, and how much time you have. If you need availability for a niche country or prices across every storefront, JustWatch still covers more ground.'
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
    answer: 'Movie, TV and watch-provider data comes from The Movie Database (TMDB); rental and purchase prices and provider deep links come from Watchmode. Availability varies by country and changes over time, so always confirm on the provider before you commit.'
  }
]

export default function JustWatchAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
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
          <Table.ScrollArea border='1px solid' borderColor='whiteAlpha.300' borderRadius='0.75rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='whiteAlpha.300'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='whiteAlpha.300'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='whiteAlpha.300'>JustWatch</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, justwatch }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{justwatch}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where JustWatch is still the better tool</Heading>
          <Text maxW='60rem'>
            JustWatch indexes more streaming providers across more countries than any other guide, and its price
            comparison spans more storefronts worldwide. Galaxy Movies&apos; price coverage is focused on the US
            today. If you need availability in a country we do not cover well, or you are comparing prices across
            every possible store, use JustWatch.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            Every movie and show page shows where it is streaming — plus real rental and purchase prices across
            stores, deep links straight to the title on each provider, and the cheapest legal way to watch called
            out. A weekly digest email tracks what is arriving on and leaving your services, and a dedicated page
            surfaces everything streaming free with ads. On top of that, instead of filtering a catalog, you
            describe the situation — a genre, a mood, a runtime limit, who is in the room — and Galaxy Bot narrows
            it to a pick, with an instant AI synopsis so you can sanity-check it before committing.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming'>streaming service</Link>, <Link href='/genre/action'>genre</Link>,{' '}
            <Link href='/lists'>curated list</Link>, or <Link href='/collections'>franchise collection</Link> — check{' '}
            <Link href='/new-on-streaming'>what is new and coming soon</Link>, see what is{' '}
            <Link href='/free'>streaming free with ads</Link>, or open the{' '}
            <Link href='/streaming-in-india'>India streaming guide</Link> for Bollywood, Tamil and Telugu coverage.
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
  );
}
