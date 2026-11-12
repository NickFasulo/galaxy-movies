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
import ImportPanel from '../features/alerts/components/ImportPanel'
import Panel from '../components/Panel'
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
  { feature: 'Watchlist, ratings & history', galaxy: 'Yes: watchlist, 1–10 ratings and a dated watched diary saved on your device', imdb: 'Yes: watchlist, 1–10 ratings and check-ins, account required' },
  { feature: 'Bring your data', galaxy: 'Yes: IMDb export CSVs import free in the browser, ratings at the same 1–10 score', imdb: '—' },
  { feature: 'Where-to-watch availability', galaxy: 'Yes: stream, rent and buy options on every movie and TV page', imdb: 'Basic: a watch-options link per title, easy to miss' },
  { feature: 'Rent/buy price comparison', galaxy: 'Yes: real rental and purchase prices, cheapest option highlighted, Plus price-drop alerts', imdb: 'No' },
  { feature: 'Store-neutral picks', galaxy: 'Yes: the cheapest store wins, no preferred retailer', imdb: 'Amazon-owned: watch options lean toward Prime Video' },
  { feature: 'Leaving-soon tracking', galaxy: 'Yes: dated departures per service, tracked daily, plus calendar feeds', imdb: 'No' },
  { feature: 'Streaming history', galaxy: 'Yes: per-title availability timeline and how-long titles typically stay', imdb: 'No' },
  { feature: 'Alerts without an account', galaxy: 'Yes: email alerts for specific titles and weekly digests, no sign-up', imdb: 'No: notifications need an account' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group, time limit and what you can stream', imdb: 'No' },
  { feature: 'Movie night for two', galaxy: 'Yes: merge two taste profiles for picks you can both stream', imdb: 'No' },
  { feature: 'Episode progress', galaxy: 'Partial: watched diary is title-level; next-episode alerts for watchlisted shows (Plus)', imdb: 'No: check-ins are title-level too' },
  { feature: 'Database depth', galaxy: 'Core facts: cast, crew and synopses via TMDB', imdb: 'Yes: the deepest cast, trivia, goofs and box-office data anywhere' },
  { feature: 'User reviews & lists', galaxy: 'No', imdb: 'Yes: millions of user reviews and public lists' },
  { feature: 'Account required', galaxy: 'No: everything works anonymously; Plus adds extras', imdb: 'Yes: watchlist, ratings and check-ins all need an account' },
  { feature: 'Mobile & TV apps', galaxy: 'Web only (installable as an app)', imdb: 'iOS and Android' },
  { feature: 'Price', galaxy: 'Free; optional Plus for alerts+', imdb: 'Free, ad-supported' }
]

const FAQ_ITEMS = [
  {
    question: 'Is IMDb shutting down?',
    answer: 'No. IMDb is owned by Amazon and is not going anywhere. This page exists because tracking on IMDb means an account, an ad-heavy app, and thin where-to-watch data, not because IMDb is closing.'
  },
  {
    question: 'Can I import my IMDb watchlist and ratings?',
    answer: 'Yes. IMDb exports your watchlist, ratings and check-ins as CSV files: pick them above. Watchlist titles land on your list, ratings carry over at the same 1–10 score, and check-ins become dated watched entries. Because the export carries IMDb IDs, matching is exact rather than a title-search guess. Everything parses in your browser; nothing uploads.'
  },
  {
    question: 'What does IMDb do that Galaxy Movies doesn\'t?',
    answer: 'The encyclopedia: full cast and crew pages, trivia, goofs, parental guides, box-office numbers and millions of user reviews. Galaxy Movies is a tracker, not an encyclopedia: it answers what to watch tonight, where it streams, what it costs and when it leaves. Plenty of people keep both.'
  },
  {
    question: 'Do I need an account to use Galaxy Movies?',
    answer: 'No. Your watchlist, ratings, watched history and service picks save to your device, and email alerts work with just an address and a confirmation click. A Plus subscription adds sync across devices, leaving-soon warnings, a personal calendar feed and price-drop alerts.'
  }
]

export default function ImdbAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/imdb-alternative`
  const title = 'A No-Account IMDb Alternative for Watchlists and Alerts'
  const description = 'Galaxy Movies is a free IMDb alternative for tracking: import your IMDb watchlist, ratings and check-ins, then see where titles stream, what they cost and when they leave — no account.'

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
          { name: 'IMDb Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            IMDb is where the whole internet looks movies up, but keeping a list there means an Amazon
            account, an ad-heavy app, and watch options that put Prime Video first. Galaxy Movies is
            the tracking half of that without the baggage: no account, your data lives on your device,
            and every title page shows where it streams, what renting costs, and when it leaves.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Bring your IMDb export</Heading>
          <Text maxW='60rem' mb={4}>
            IMDb exports your watchlist, ratings and check-ins as CSV files. Pick them together here:
            the watchlist lands on your list, ratings carry over at the same score (both sites use a
            1–10 scale), and check-ins become dated entries in your watched diary. Since each row
            carries its IMDb ID, matching is exact rather than a title-search guess. Everything parses
            in your browser; the files never leave this tab.
          </Text>
          <Panel maxW='36rem'>
            <ImportPanel source='imdb' />
          </Panel>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs IMDb</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>IMDb</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, imdb }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{imdb}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What IMDb does that we don&apos;t</Heading>
          <Text maxW='60rem'>
            IMDb is the reference book of film and TV: complete cast and crew pages, trivia, goofs,
            parental guides, box-office numbers, news and millions of user reviews. Galaxy Movies does
            not try to be that. It is a tracker — a list of what you want to see, what you thought of
            it, and where to stream it tonight. For trivia night, keep IMDb bookmarked; for keeping a
            list without an account watching you, this is the calmer home.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            No account anywhere: importing, tracking, ratings and email alerts all work anonymously,
            and your data lives on your device rather than an Amazon server. Every title page shows
            where it streams plus real rent and buy prices with the cheapest option called out, its
            streaming history, and how long titles typically stay — data IMDb does not track. Alerts
            cover arrivals, departures and price drops, and Galaxy Bot recommends from what you can
            actually stream tonight — including a{' '}
            <Link href='/movie-night' style={{ textDecoration: 'underline' }}>movie-night merge</Link>{' '}
            for two people&apos;s tastes.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>,{' '}
            <Link href='/lists' style={{ textDecoration: 'underline' }}>curated list</Link>, or <Link href='/collections' style={{ textDecoration: 'underline' }}>franchise collection</Link>: check{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new and coming soon</Link>, see the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>streaming churn report</Link>.
          </Text>

          <ComparisonLinks exclude='/imdb-alternative' />

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
