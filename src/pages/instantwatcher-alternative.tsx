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
  { feature: 'Status', galaxy: 'Active: catalogs tracked daily', instantwatcher: 'Largely unmaintained for years' },
  { feature: 'Browse a service catalog', galaxy: 'Yes: full browsable catalogs per provider, plus genre slices', instantwatcher: 'Yes: fast Netflix and Amazon browsing' },
  { feature: 'New releases & departures', galaxy: 'Yes: dated daily diffs — what arrived and what left each service', instantwatcher: 'New releases only, update cadence degraded' },
  { feature: 'Services covered', galaxy: 'Netflix, Hulu, Max, Disney+, Prime Video, Apple TV+, Paramount+, Peacock and more', instantwatcher: 'Netflix and Amazon' },
  { feature: 'Where-to-watch search', galaxy: 'Yes: stream, rent and buy options with prices on every title page', instantwatcher: 'Netflix/Amazon availability only' },
  { feature: 'Arrival alerts', galaxy: 'Yes: email alerts when a saved title lands on a service', instantwatcher: 'No' },
  { feature: 'Mobile experience', galaxy: 'Responsive web app, installable', instantwatcher: 'Dated desktop-first UI' },
  { feature: 'Account required', galaxy: 'No', instantwatcher: 'No' },
  { feature: 'Price', galaxy: 'Free', instantwatcher: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'Is InstantWatcher still maintained?',
    answer: 'InstantWatcher is still online but has been largely unmaintained for years — its interface and data pipeline have not kept pace with current streaming services. Galaxy Movies tracks the major US providers daily and covers far more services than Netflix and Amazon.'
  },
  {
    question: 'What was InstantWatcher good at?',
    answer: 'InstantWatcher was loved for its speed: a dense, no-frills way to browse the Netflix catalog. Galaxy Movies keeps the same philosophy — fast, ad-light catalog browsing per provider — while adding dated arrival and departure diffs, leaving-soon lists, and rental and purchase prices.'
  },
  {
    question: 'Is Galaxy Movies free?',
    answer: 'Yes. Browsing catalogs, new-and-leaving feeds, and watch-provider lookup are free with no account required.'
  },
  {
    question: 'Where does the data come from?',
    answer: 'Availability and catalog data come from The Movie Database (TMDB) and Watchmode, refreshed daily from provider catalogs.'
  }
]

export default function InstantWatcherAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/instantwatcher-alternative`
  const title = 'A Free InstantWatcher Alternative for Browsing Streaming Catalogs'
  const description = 'InstantWatcher has been unmaintained for years. Galaxy Movies is the modern equivalent: fast browsing of every major US streaming catalog, dated arrival and departure diffs, and alerts when saved titles land.'

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
          { name: 'InstantWatcher Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            InstantWatcher was the cult-favorite way to skim the Netflix catalog — dense, fast, no fluff — but it
            has been largely unmaintained for years while the streaming world moved on. Galaxy Movies is the
            modern version: browsable catalogs for every major US service, updated daily, with dated diffs so you
            always know what actually arrived and what left.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs InstantWatcher</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>InstantWatcher</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, instantwatcher }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{instantwatcher}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds on top</Heading>
          <Text maxW='60rem'>
            Every title page shows where it is streaming with deep links to each provider, real rental and
            purchase prices across stores, and how long titles typically stay on each service. Daily catalog
            diffs power a leaving-soon list, per-service new-release pages, and a monthly churn report — and
            saved-title alerts email you the day something you want lands on a service you have.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link> or{' '}
            <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>, see{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new</Link> and{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>what is leaving soon</Link>, or check{' '}
            <Link href='/this-month' style={{ textDecoration: 'underline' }}>this month&apos;s verdicts</Link>.
          </Text>

          <ComparisonLinks exclude='/instantwatcher-alternative' />

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
