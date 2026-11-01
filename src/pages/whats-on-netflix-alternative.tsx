import type { InferGetStaticPropsType } from 'next'
import Link from 'next/link'
import {
  Box,
  Heading,
  Text,
  Table
} from '@chakra-ui/react'
import { fetchDiscoverMovies } from '../features/catalog/tmdb'
import MovieGrid from '../features/catalog/components/MovieGrid'
import ComparisonLinks from '../components/ComparisonLinks'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { SITE_URL } from '../lib/site'
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
  { feature: 'New on Netflix lists', galaxy: 'Yes: dated arrivals detected daily', won: 'Yes: editorial lists and previews' },
  { feature: 'Leaving Netflix lists', galaxy: 'Yes: departures tracked daily with leaving dates', won: 'Yes: leaving-soon roundups' },
  { feature: 'Services covered', galaxy: 'Eight US services: Netflix, Prime Video, Hulu, Disney+, Max, Peacock, Paramount+ and Apple TV+', won: 'Netflix focused, with some rival coverage in articles' },
  { feature: 'Per-title streaming history', galaxy: 'Yes: when a title arrived, left, and how long titles typically stay', won: 'No' },
  { feature: 'Alerts for specific titles', galaxy: 'Yes: email alerts for arrivals and departures, no account needed', won: 'No title-level alerts' },
  { feature: 'Calendar feeds', galaxy: 'Yes: subscribe to any service\u2019s arrivals and departures in your calendar', won: 'No' },
  { feature: 'Streaming churn report', galaxy: 'Yes: monthly net adds and losses per service', won: 'No' },
  { feature: 'Rent/buy price comparison', galaxy: 'Yes: real prices, cheapest option highlighted, Plus price-drop alerts', won: 'No' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group, time limit and what you can stream', won: 'No' },
  { feature: 'Editorial news & previews', galaxy: 'No: data lists only', won: 'Yes: news, previews, interviews and K-drama coverage' },
  { feature: 'Regions', galaxy: 'US catalogs for change tracking; India browsing guide', won: 'Multiple Netflix regions' },
  { feature: 'Account required', galaxy: 'No', won: 'No' },
  { feature: 'Price', galaxy: 'Free; optional Plus for alerts+', won: 'Free, ad-supported' }
]

const FAQ_ITEMS = [
  {
    question: 'Is Galaxy Movies a good What\u2019s on Netflix alternative?',
    answer: 'If you come for the new-and-leaving lists, yes — Galaxy Movies publishes the same daily arrivals and departures, plus dated leaving-soon notices, and extends them to seven more services. If you read What\u2019s on Netflix for its news and previews, that editorial coverage is something we do not do.'
  },
  {
    question: 'Does Galaxy Movies cover Netflix?',
    answer: 'Yes. Netflix is one of eight services tracked daily: arrivals, departures, scheduled leaving dates and a monthly churn report all include it, alongside Prime Video, Hulu, Disney+, Max, Peacock, Paramount+ and Apple TV+.'
  },
  {
    question: 'Does it cover regions outside the US?',
    answer: 'Catalog-change tracking is US-only today (plus an India browsing guide). What\u2019s on Netflix covers more Netflix regions, so use it if you need UK or other country editions.'
  },
  {
    question: 'How often is the data updated?',
    answer: 'Catalogs are checked daily. Arrivals and departures land on the service pages the same day they are detected; the churn report aggregates each calendar month.'
  }
]

export default function WhatsOnNetflixAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/whats-on-netflix-alternative`
  const title = 'A What\u2019s on Netflix Alternative That Covers Every Service'
  const description = 'Galaxy Movies is a free What\u2019s on Netflix alternative: the same daily new and leaving lists, but for eight streaming services — with alerts, calendar feeds and a monthly churn report.'

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer }
    }))
  }

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={movies[0]?.poster_path}
        structuredData={faqSchema}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: "What's on Netflix Alternative", url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            What&apos;s on Netflix is the editorial answer to one question — what is new and leaving on Netflix —
            told through news, previews and curated lists. Galaxy Movies answers the same question automatically
            for eight services at once, every day, and turns it into tools: title alerts, calendar feeds and a
            monthly churn report.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs What&apos;s on Netflix</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>What&apos;s on Netflix</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, won }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{won}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where What&apos;s on Netflix is still the better read</Heading>
          <Text maxW='60rem'>
            What&apos;s on Netflix has real editorial depth: news, previews, interviews and deep K-drama coverage
            across multiple Netflix regions. Galaxy Movies publishes data, not articles — if you want the story
            behind a title or coverage of a non-US Netflix catalog, it remains the better source.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            The lists update themselves: every tracked service gets daily arrival and departure diffs, dated
            leaving-soon notices, and per-title history showing how long titles typically stay. You can subscribe
            to a service&apos;s{' '}
            <Link href='/leaving/netflix' style={{ textDecoration: 'underline' }}>leaving calendar</Link>, get
            an email when a specific title arrives or departs, or check the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>streaming churn report</Link>{' '}
            for which catalog is actually growing. Add real rental prices and an AI picker filtered to your
            services, and it covers the whole &quot;what to watch tonight&quot; question.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Start with <Link href='/leaving/netflix' style={{ textDecoration: 'underline' }}>leaving Netflix</Link> or{' '}
            <Link href='/new-on-streaming/netflix' style={{ textDecoration: 'underline' }}>new on Netflix</Link>, browse by{' '}
            <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link> or{' '}
            <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>, and see the{' '}
            <Link href='/this-month/netflix' style={{ textDecoration: 'underline' }}>monthly verdict for Netflix</Link>.
          </Text>

          <ComparisonLinks exclude='/whats-on-netflix-alternative' />

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Frequently asked questions</Heading>
          {FAQ_ITEMS.map(({ question, answer }) => (
            <Box key={question} mb={6}>
              <Heading as='h3' size='sm' mb={2}>{question}</Heading>
              <Text maxW='60rem' color='gray.300'>{answer}</Text>
            </Box>
          ))}

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Popular movies to watch now</Heading>
          {dataError ? (
            <Text mt={4} color='gray.400'>Movie data is temporarily unavailable. Please try again later.</Text>
          ) : (
            <MovieGrid movies={movies} />
          )}

          <Text textAlign='center' mt={8} color='gray.400'>
            Availability varies by country and changes over time: check each title page for current providers.
          </Text>
      </PageShell>
    </>
  );
}
