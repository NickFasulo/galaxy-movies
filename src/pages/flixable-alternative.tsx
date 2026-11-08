import type { InferGetStaticPropsType } from 'next'
import Link from 'next/link'
import { Box, Heading, Text, Table } from '@chakra-ui/react'
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
    return { props: { movies: data.results.slice(0, 10) }, revalidate: 86400 }
  } catch (error) {
    console.error(error)
    return { props: { movies: [], dataError: true }, revalidate: 3600 }
  }
}

const COMPARISON_ROWS = [
  { feature: 'Status', galaxy: 'Active: catalogs tracked daily', flixable: 'Shut down' },
  { feature: 'New releases on streaming', galaxy: 'Yes: daily per-service diffs for every major US provider', flixable: 'Yes: Netflix new releases' },
  { feature: 'Titles leaving soon', galaxy: 'Yes: dated departures, plus a last-chance list per service', flixable: 'Limited' },
  { feature: 'Services covered', galaxy: 'Netflix, Hulu, Max, Disney+, Prime Video, Apple TV+, Paramount+, Peacock and more', flixable: 'Netflix, with some expansion before shutdown' },
  { feature: 'Arrival alerts', galaxy: 'Yes: email alerts when a saved title lands on a service', flixable: 'No' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group and time limit', flixable: 'No' },
  { feature: 'Account required', galaxy: 'No', flixable: 'No' },
  { feature: 'Price', galaxy: 'Free', flixable: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'What happened to Flixable?',
    answer: 'Flixable, the fast new-releases tracker for Netflix, shut down after its operator stopped maintaining it. The site no longer updates. Galaxy Movies tracks new arrivals and departures across every major US streaming service, updated daily.'
  },
  {
    question: 'Does Galaxy Movies show what is leaving Netflix?',
    answer: 'Yes. The leaving pages list dated departures per service, and the this-month view shows what is arriving and departing in the current month — for Netflix and for every other tracked US provider.'
  },
  {
    question: 'Is Galaxy Movies free?',
    answer: 'Yes. Browsing, the new-and-leaving feeds, watch-provider lookup and arrival alerts are free, and no account is required for browsing.'
  },
  {
    question: 'Where does the data come from?',
    answer: 'Availability and catalog data come from The Movie Database (TMDB) and Watchmode. Our changelogs are computed from daily catalog snapshots, so arriving and leaving dates reflect when a title actually appeared or disappeared.'
  }
]

export default function FlixableAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/flixable-alternative`
  const title = 'A Free Flixable Alternative for Tracking Streaming Releases'
  const description = 'Flixable shut down. Galaxy Movies tracks new releases and departures across every major US streaming service, updated daily — with alerts when titles you want land on your services.'

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
          { name: 'Flixable Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            Flixable earned a following as the fastest way to see what was new on Netflix — then it shut down.
            Galaxy Movies does the same job across every major US service: daily diffs show what arrived and what
            left each catalog, dated leaving-soon lists flag last chances, and saved-title alerts email you the
            day something you want lands on a service you have.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs Flixable</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Flixable</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, flixable }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{flixable}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds on top</Heading>
          <Text maxW='60rem'>
            Beyond the new-releases feed Flixable was known for, every movie and show page shows where it is
            streaming right now with deep links to the title on each provider, real rental and purchase prices,
            and how long titles typically stay on each service. A weekly digest summarizes everything arriving
            and leaving, and Galaxy Bot can pick something to watch from a mood, a runtime limit, or who is in
            the room.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            See <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new on streaming</Link>,{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>what is leaving soon</Link>,{' '}
            <Link href='/this-month' style={{ textDecoration: 'underline' }}>this month&apos;s arrivals and departures</Link>, or the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>monthly churn report</Link> tracking which services are growing or shrinking.
          </Text>

          <ComparisonLinks exclude='/flixable-alternative' />

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
