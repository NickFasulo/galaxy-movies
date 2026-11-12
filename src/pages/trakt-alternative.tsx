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
  { feature: 'Where-to-watch availability', galaxy: 'Yes: stream, rent and buy options on every movie and TV page', trakt: 'Basic: where-to-watch links sourced from JustWatch' },
  { feature: 'Watchlist, ratings & diary', galaxy: 'Yes: watchlist, ratings, and a dated watched diary saved on your device, no account', trakt: 'Yes: full tracking history, account required' },
  { feature: 'Alerts without an account', galaxy: 'Yes: email alerts for specific titles and weekly digests, no sign-up', trakt: 'No: notifications need a Trakt account' },
  { feature: 'Streaming-change tracking', galaxy: 'Yes: arrivals and departures per service, tracked daily, plus a monthly churn report', trakt: 'No: shows where to watch now, not what changed' },
  { feature: 'Streaming history & predictions', galaxy: 'Yes: per-title availability timeline and how-long titles typically stay', trakt: 'No' },
  { feature: 'Rent/buy price comparison', galaxy: 'Yes: real rental and purchase prices, cheapest option highlighted, Plus price-drop alerts', trakt: 'No' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group, time limit and what you can stream', trakt: 'No' },
  { feature: 'Movie night for two', galaxy: 'Yes: merge two taste profiles for picks you can both stream', trakt: 'No' },
  { feature: 'Automatic watch tracking', galaxy: 'No scrobbling: you mark titles watched manually or import your history; Plus can sync your Trakt history in', trakt: 'Yes: scrobbles automatically from Plex, Kodi and media apps' },
  { feature: 'Episode progress', galaxy: 'Partial: imported episode watches roll up per show; next-episode alerts and calendar events for watchlisted shows (Plus)', trakt: 'Yes: per-episode progress across every show' },
  { feature: 'Community & comments', galaxy: 'No', trakt: 'Yes: large community, comments and public lists' },
  { feature: 'Import your history', galaxy: 'Yes: TV Time, Letterboxd and IMDb files import free in the browser; Trakt sync is Plus', trakt: '—' },
  { feature: 'Account required', galaxy: 'No: everything works anonymously; Plus adds extras', trakt: 'Yes: tracking and sync all require an account' },
  { feature: 'Price', galaxy: 'Free; optional Plus for alerts+', trakt: 'Free tier; VIP removes ads and adds features' }
]

const FAQ_ITEMS = [
  {
    question: 'Is Galaxy Movies a good Trakt alternative?',
    answer: 'Yes if what you want is a watchlist, ratings, a watched diary and alerts without maintaining another account — plus streaming-change data Trakt does not track, like dated departures and monthly churn. Trakt stays ahead if you rely on automatic scrobbling, per-episode progress or its community.'
  },
  {
    question: 'Can I import my Trakt history into Galaxy Movies?',
    answer: 'Yes. Plus subscribers can connect Trakt to sync their watchlist and ratings over — after that, alerts and recommendations work with no Trakt account involved at all.'
  },
  {
    question: 'Does Galaxy Movies track episodes like Trakt?',
    answer: 'Partially. Plus subscribers get next-episode air-date alerts and calendar events for watchlisted shows, but Galaxy Movies does not mark per-episode progress the way Trakt does.'
  },
  {
    question: 'Where does Galaxy Movies get its data?',
    answer: 'Movie, TV and watch-provider data comes from The Movie Database (TMDB); rental and purchase prices and provider deep links come from Watchmode; catalog changes are detected daily from the providers we track. Availability varies by country and changes over time.'
  }
]

export default function TraktAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/trakt-alternative`
  const title = 'A No-Account Trakt Alternative for Watchlists and Alerts'
  const description = 'Galaxy Movies is a free Trakt alternative: watchlists, ratings, a watched diary, email alerts and streaming-change tracking with no account — and it can sync your Trakt history if you have one.'

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
          { name: 'Trakt Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            Trakt is the tracker for people who want their watching logged everywhere it happens: automatic
            scrobbling, per-episode progress, comments and community — all behind an account. Galaxy Movies is
            built for the other 90% of the job: a watchlist, ratings, where-to-watch answers and alerts that
            work with nothing but an email address. And if you already have a Trakt history, Plus can sync it in.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs Trakt</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Trakt</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, trakt }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{trakt}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Where Trakt is still the better tool</Heading>
          <Text maxW='60rem'>
            If you want your watching tracked automatically, Trakt wins outright: it scrobbles plays from Plex,
            Kodi and media apps, marks every episode, and backs it with a big community. Galaxy Movies is
            web-only and manual — you rate titles rather than have them observed. If a passive, complete watch
            log matters more than zero-friction alerts, use Trakt.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            Trakt tells you where a title streams today; Galaxy Movies tells you when it arrived, when it is
            scheduled to leave, and how long titles like it typically stay — tracked daily across eight services
            and published in a monthly churn report. Alerts need no account: follow one title or get a weekly
            digest for your services with a single confirmation click. Title pages show real rental prices with
            the cheapest option called out, Galaxy Bot recommends picks filtered to what you can stream, and a{' '}
            <Link href='/movie-night' style={{ textDecoration: 'underline' }}>movie-night merge</Link> finds
            picks for two people&apos;s tastes.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>,{' '}
            <Link href='/lists' style={{ textDecoration: 'underline' }}>curated list</Link>, or <Link href='/collections' style={{ textDecoration: 'underline' }}>franchise collection</Link>: check{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new and coming soon</Link>, see what is{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>leaving soon</Link>, or read the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>streaming churn report</Link>.
          </Text>

          <ComparisonLinks exclude='/trakt-alternative' />

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
          <Text textAlign='center' mt={4} fontSize='sm' color='gray.500'>
            Galaxy Movies uses Trakt but is not endorsed or certified by Trakt.
          </Text>
      </PageShell>
    </>
  );
}
