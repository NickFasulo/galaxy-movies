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
  { feature: 'Where-to-watch availability', galaxy: 'Yes: stream, rent and buy options on every movie and TV page', reelgood: 'Yes: large aggregator covering US and UK catalogs' },
  { feature: 'Watchlist & seen-it tracking', galaxy: 'Yes: watchlist and ratings saved on your device, no account', reelgood: 'Yes: unified tracking across services, account required' },
  { feature: 'Alerts without an account', galaxy: 'Yes: email alerts for specific titles and weekly digests, no sign-up', reelgood: 'No: notifications require a free account' },
  { feature: 'Leaving-soon tracking', galaxy: 'Yes: dated departures per service, tracked daily, plus calendar feeds', reelgood: 'Yes: leaving lists inside the app' },
  { feature: 'Streaming history & predictions', galaxy: 'Yes: per-title availability timeline and how-long titles typically stay', reelgood: 'No' },
  { feature: 'Rent/buy price comparison', galaxy: 'Yes: real rental and purchase prices, cheapest option highlighted, Plus price-drop alerts', reelgood: 'Limited: pricing shown but not compared across stores' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group, time limit and what you can stream', reelgood: 'No' },
  { feature: 'Movie night for two', galaxy: 'Yes: merge two taste profiles for picks you can both stream', reelgood: 'No' },
  { feature: 'Episode tracking', galaxy: 'Yes: next-episode alerts and calendar events for watchlisted shows (Plus)', reelgood: 'Yes: automatic next-episode tracking' },
  { feature: 'Deep links into each provider', galaxy: 'Yes: provider icons take you to the title itself', reelgood: 'Yes' },
  { feature: 'Free & ad-supported browsing', galaxy: 'Yes: a dedicated page of movies and shows streaming free', reelgood: 'Yes' },
  { feature: 'Movies and TV shows', galaxy: 'Yes', reelgood: 'Yes' },
  { feature: 'Mobile & TV apps', galaxy: 'Web only', reelgood: 'iOS, Android, Roku and Fire TV' },
  { feature: 'Account required', galaxy: 'No: everything works anonymously; Plus adds extras', reelgood: 'Yes: sign-up needed for tracking and alerts' },
  { feature: 'Price', galaxy: 'Free; optional Plus for alerts+', reelgood: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'Is Galaxy Movies a good Reelgood alternative?',
    answer: 'Yes if you want tracking without the account. Galaxy Movies covers where to stream, rent and buy with real prices, tracks arrivals and departures per service, and emails you about titles you pick — all without signing up. Reelgood remains stronger if you want automatic seen-it tracking and native TV apps.'
  },
  {
    question: 'Do I need an account to use Galaxy Movies?',
    answer: 'No. Watchlists, ratings and service picks save to your device, and email alerts work with just an email address and a confirmation click. A Plus subscription adds leaving-soon warnings, a personal calendar feed, price-drop alerts and share links — still no password.'
  },
  {
    question: 'Does Galaxy Movies track TV shows?',
    answer: 'Yes. Shows get the same availability pages, arrival and departure alerts, and Plus subscribers get next-episode air-date alerts and calendar events.'
  },
  {
    question: 'Where does Galaxy Movies get its data?',
    answer: 'Movie, TV and watch-provider data comes from The Movie Database (TMDB); rental and purchase prices and provider deep links come from Watchmode; catalog changes are detected daily from the providers we track. Availability varies by country and changes over time, so always confirm on the provider before you commit.'
  }
]

export default function ReelgoodAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/reelgood-alternative`
  const title = 'A No-Account Reelgood Alternative for Tracking and Alerts'
  const description = 'Galaxy Movies is a free Reelgood alternative that tracks where to stream, what is arriving and leaving, and rental prices — with email alerts that need no account.'

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
          { name: 'Reelgood Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            Reelgood is the aggregator for people who want one app to track everything they watch: a single
            watchlist, automatic seen-it marking, and next-episode tracking — all behind a free account. Galaxy
            Movies takes the opposite bet: the same tracking and alerts, but nothing requires a sign-up. Your
            watchlist lives on your device, and alerts land in your inbox with one confirmation click.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs Reelgood</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Reelgood</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, reelgood }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{reelgood}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where Reelgood is still the better tool</Heading>
          <Text maxW='60rem'>
            If you live on a TV app, Reelgood wins: it ships native iOS, Android, Roku and Fire TV apps and marks
            episodes seen automatically as you watch. Galaxy Movies is web-only, and watch history is something
            you rate rather than something we observe. If passive, automatic tracking across a household matters
            more than privacy and zero friction, use Reelgood.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            Because nothing sits behind a login, every alert works from a single email click: follow one title,
            get the weekly digest for your services, or subscribe to a service&apos;s leaving calendar — all
            without an account. On top of tracking, each title page shows its streaming history and how long
            titles typically stay, real rental and purchase prices with the cheapest option called out, and
            Galaxy Bot recommendations filtered to what you can actually stream tonight. Plus adds leaving-soon
            warnings, price-drop alerts, episode calendars and share links — including a{' '}
            <Link href='/movie-night' style={{ textDecoration: 'underline' }}>movie-night merge</Link> that finds
            picks for two people&apos;s tastes.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>,{' '}
            <Link href='/lists' style={{ textDecoration: 'underline' }}>curated list</Link>, or <Link href='/collections' style={{ textDecoration: 'underline' }}>franchise collection</Link>: check{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new and coming soon</Link>, see the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>streaming churn report</Link>.
          </Text>

          <ComparisonLinks exclude='/reelgood-alternative' />

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
