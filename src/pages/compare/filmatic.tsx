import type { InferGetStaticPropsType } from 'next'
import Link from 'next/link'
import {
  Box,
  Heading,
  Text,
  Table
} from '@chakra-ui/react'
import { fetchDiscoverMovies } from '../../features/catalog/tmdb'
import MovieGrid from '../../features/catalog/components/MovieGrid'
import ComparisonLinks from '../../components/ComparisonLinks'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { SITE_URL } from '../../lib/site'
import type { TmdbMovie } from '../../types/tmdb'

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
  { feature: 'How it recommends', galaxy: 'Describe the situation: mood, who is watching, how much time you have. Galaxy Bot narrows it to a pick, or you browse lists and collections.', filmatic: 'A taste model built from your swipes serves one decided pick, with the reason why.' },
  { feature: 'Learning your taste', galaxy: 'Your ratings, watchlist and what you tell the assistant tonight; all stored on your device', filmatic: 'A persistent taste profile per account that sharpens with every swipe' },
  { feature: 'Setup before the first pick', galaxy: 'None: open the site and use it', filmatic: 'Rate around twenty movies so the model can start' },
  { feature: 'What it can pick from', galaxy: 'Your streaming services plus rent and buy options, with real prices and the cheapest called out', filmatic: 'Only the services you already have: it never suggests a rental' },
  { feature: 'Pairing films', galaxy: 'Similar titles on every title page plus "movies like X" lists', filmatic: 'Double Feature: name a film you love, get the one to watch after' },
  { feature: 'Two-person picks', galaxy: 'Movie Night merges two taste profiles into one pick', filmatic: 'Two-person mode reads both tastes and picks for both' },
  { feature: 'Watchlist and tracking', galaxy: 'Watchlist, ratings and a watched diary, no account; imports from TV Time, Letterboxd and IMDb free in the browser', filmatic: 'Saved, loved, neutral and skipped lists tied to your account' },
  { feature: 'Leaving-soon warnings', galaxy: 'Per-service departure pages, email alerts on your watchlist, and a weekly digest', filmatic: 'Warns when a saved film is about to leave' },
  { feature: 'Catalogue browsing', galaxy: 'Full browse by service, genre, curated list and franchise collection', filmatic: 'Deliberately none: the point is to stop scrolling' },
  { feature: 'Platforms', galaxy: 'Web app, installable on iOS, Android and desktop', filmatic: 'iOS, Android and web' },
  { feature: 'Account required', galaxy: 'No', filmatic: 'Yes: the taste profile lives in your account' },
  { feature: 'Social layer', galaxy: 'None', filmatic: 'None' },
  { feature: 'Price', galaxy: 'Free, with an optional Plus subscription', filmatic: 'Not published on its site' }
]

const FAQ_ITEMS = [
  {
    question: 'What is the best app to discover new films based on what you have already watched?',
    answer: 'Two apps answer it in different ways. Filmatic builds a taste model from your ratings and serves one decided pick per session. Galaxy Movies answers it with no account: Galaxy Bot picks from your mood and your services, "movies like X" lists branch off titles you already like, and your ratings never leave your device. For a persistent profile that learns you over months, pick Filmatic. For a pick tonight without the setup, pick Galaxy Movies.'
  },
  {
    question: 'Is Filmatic free?',
    answer: 'Filmatic does not list pricing on its site; it is available on iOS, Android and the web. Galaxy Movies is free to use, with an optional Plus subscription that raises alert and sync limits.'
  },
  {
    question: 'Does Galaxy Movies learn my taste like Filmatic does?',
    answer: 'Not in the same way. Galaxy Movies works off your on-device ratings, your watchlist and whatever you tell Galaxy Bot about tonight. There is no server-side taste model, by design: your profile never leaves the device. Filmatic keeps a taste model per account and improves it with every swipe.'
  },
  {
    question: 'Do I need an account?',
    answer: 'Not for Galaxy Movies: the watchlist, ratings and diary save to your device, and the only sign-in is an optional email key for alerts. Filmatic needs an account because the taste profile is the product.'
  }
]

export default function FilmaticComparison({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/compare/filmatic`
  const title = 'Galaxy Movies vs Filmatic'
  const description = 'Both apps discover films from what you have already watched. Filmatic learns a taste profile and decides for you; Galaxy Movies hands you the tools and gets out of the way. No account needed.'

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
          { name: 'Compare', url: `${SITE_URL}/compare` },
          { name: 'Filmatic', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            Filmatic and Galaxy Movies both answer the same question, <em>what should I watch
            tonight</em>, and both answer it from what you have already watched. The difference is
            how they get there. Filmatic learns a taste profile and decides for you: one pick, one
            reason, swipe for the next. Galaxy Movies hands you the whole toolkit (a conversational
            assistant, every where-to-watch answer, tracking, alerts) and trusts you to drive.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs Filmatic</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Filmatic</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, filmatic }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{filmatic}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where Filmatic is the better tool</Heading>
          <Text maxW='60rem'>
            If you want an app that learns you over months and gets sharper with every swipe,
            Filmatic&apos;s persistent taste model is the real thing, and it runs as a native app on
            iOS and Android. Its one-pick-and-why design is the most opinionated take in this space,
            and if you never want to browse a catalogue again, that is the pitch. Galaxy Movies keeps
            your profile on your device instead, which means it cannot grow into that kind of model
            by design.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            Everything around the pick. Each title page shows where it is streaming plus real rental
            and purchase prices with the cheapest option called out. Departure pages and alerts tell
            you when something is leaving your service before it goes, and the monthly churn report
            tracks each catalogue&apos;s gains against its losses. Watchlists, ratings and a watched
            diary need no account and import straight from Letterboxd, TV Time or IMDb. And you can
            still browse by service, genre, curated list or franchise when you would rather look
            than ask.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Try <Link href='/movie-night' style={{ textDecoration: 'underline' }}>Movie Night</Link> for a two-person pick, browse{' '}
            <Link href='/lists' style={{ textDecoration: 'underline' }}>curated lists</Link> or{' '}
            <Link href='/streaming' style={{ textDecoration: 'underline' }}>your services</Link>, see what is{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>new and coming soon</Link> or{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>leaving</Link>, or open your{' '}
            <Link href='/watchlist' style={{ textDecoration: 'underline' }}>watchlist</Link> to import from another tracker.
          </Text>

          <ComparisonLinks exclude='/compare/filmatic' />

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
