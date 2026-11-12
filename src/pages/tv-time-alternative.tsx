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
  { feature: 'Status', galaxy: 'Actively maintained and shipping', tvtime: 'Shut down July 15, 2026' },
  { feature: 'Bring your data', galaxy: 'Yes: imports a saved TV Time GDPR export (ZIP or CSVs) in the browser, watched history included', tvtime: 'Exports were GDPR-only; no longer available' },
  { feature: 'Watchlist, ratings & history', galaxy: 'Yes: watchlist, 1–10 ratings and a dated watched diary saved on your device', tvtime: 'Yes: shows marked watched per episode' },
  { feature: 'Episode-level tracking', galaxy: 'Partial: episode watches roll up per show (count and last episode seen); no per-episode check-ins', tvtime: 'Yes: per-episode check-ins were its core feature' },
  { feature: 'Where-to-watch availability', galaxy: 'Yes: stream, rent and buy options on every movie and TV page', tvtime: 'Yes: showed streaming availability per title' },
  { feature: 'Alerts without an account', galaxy: 'Yes: email alerts for specific titles and weekly digests, no sign-up', tvtime: 'No: notifications required an account' },
  { feature: 'Leaving-soon tracking', galaxy: 'Yes: dated departures per service, tracked daily, plus calendar feeds', tvtime: 'No' },
  { feature: 'Rent/buy price comparison', galaxy: 'Yes: real rental and purchase prices, cheapest option highlighted', tvtime: 'No' },
  { feature: 'AI recommendation assistant', galaxy: 'Yes: Galaxy Bot picks by mood, group, time limit and what you can stream', tvtime: 'No' },
  { feature: 'Community features', galaxy: 'No', tvtime: 'Yes: episode comments and memes' },
  { feature: 'Movies and TV shows', galaxy: 'Yes', tvtime: 'Yes' },
  { feature: 'Mobile & TV apps', galaxy: 'Web only (installable as an app)', tvtime: 'iOS and Android' },
  { feature: 'Account required', galaxy: 'No: everything works anonymously; Plus adds extras', tvtime: 'Yes' },
  { feature: 'Price', galaxy: 'Free; optional Plus for alerts+', tvtime: 'Free; a paid tier never covered costs' }
]

const FAQ_ITEMS = [
  {
    question: 'What happened to TV Time?',
    answer: 'TV Time shut down on July 15, 2026 after roughly 26 million installs. The team said its premium plan covered only a fraction of server costs and there was not enough demand for a paid version at its scale.'
  },
  {
    question: 'Can I import my TV Time data into Galaxy Movies?',
    answer: 'Yes, if you saved a GDPR export before the shutdown. Pick the ZIP file (or the CSVs inside it) above: followed shows land on your watchlist, movie ratings import on the 1–10 scale, and your watched history becomes a dated diary. Episode watches roll up per show — you get "62 eps, last S5E16" rather than a check-in for every episode. Everything parses in your browser.'
  },
  {
    question: 'Is Galaxy Movies a good TV Time alternative?',
    answer: 'For tracking what to watch next and where to stream it, yes: watchlist and ratings with no account, per-service availability, arrival and departure alerts, and rental prices. If you need per-episode check-ins, rewatches, or the comment threads TV Time had, look at episode trackers like Trakt or Serializd instead.'
  },
  {
    question: 'Do I need an account to use Galaxy Movies?',
    answer: 'No. Your watchlist, ratings and service picks save to your device, and email alerts work with just an address and a confirmation click. A Plus subscription adds sync across devices, leaving-soon warnings, a personal calendar feed and price-drop alerts.'
  }
]

export default function TvTimeAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/tv-time-alternative`
  const title = 'TV Time Alternative: Import Your List, No Account Needed'
  const description = 'TV Time shut down in July 2026. Galaxy Movies is a free TV Time alternative that imports your GDPR export: watchlist, ratings, watched history, where-to-watch and alerts with no account.'

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
          { name: 'TV Time Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            TV Time shut down on July 15, 2026, leaving tens of millions of trackers without a home. Galaxy Movies
            covers the part most people actually used: keeping a list, rating what you saw, remembering what you
            watched, and knowing where to stream it next. It does that without an account: your data lives on your
            device, alerts land in your
            inbox with one confirmation click, and the whole import below runs in your browser.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Bring your TV Time export</Heading>
          <Text maxW='60rem' mb={4}>
            If you downloaded your GDPR data export before the shutdown, it still works here. Pick the ZIP as you
            got it, or the CSV files inside: followed shows join your watchlist, your movie ratings import on the
            1–10 scale, and everything you watched becomes a dated diary entry. Episode watches roll up to the
            show: &quot;62 eps, last S5E16&quot; instead of a row per episode. Nothing uploads; the file never leaves
            this tab.
          </Text>
          <Panel maxW='36rem'>
            <ImportPanel source='tvtime' />
          </Panel>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs TV Time</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>TV Time</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, tvtime }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{tvtime}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What TV Time did that we don&apos;t</Heading>
          <Text maxW='60rem'>
            TV Time&apos;s magic was the episode check-in: tap each episode as you watched, get the exact next one,
            plus comments and memes under every episode. Galaxy Movies tracks titles: your imported episode
            history collapses into one watched entry per show with the count and last episode seen, but there are
            no per-episode check-ins here. If granular per-episode progress is what you miss,{' '}
            <Link href='/trakt-alternative' style={{ textDecoration: 'underline' }}>Trakt</Link> or Serializd are
            the closer fit, and your list here can sync to Trakt with Plus.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds</Heading>
          <Text maxW='60rem'>
            No account anywhere: importing, tracking, ratings and email alerts all work anonymously, so a service
            shutdown can never strand your list again. Every title page shows where it streams plus real rent and
            buy prices with the cheapest option called out, its streaming history, and how long titles typically
            stay. Alerts cover arrivals, departures and price drops, and Galaxy Bot recommends from what you can
            actually stream tonight — including a{' '}
            <Link href='/movie-night' style={{ textDecoration: 'underline' }}>movie-night merge</Link> for two
            people&apos;s tastes.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, <Link href='/genre/action' style={{ textDecoration: 'underline' }}>genre</Link>,{' '}
            <Link href='/lists' style={{ textDecoration: 'underline' }}>curated list</Link>, or <Link href='/collections' style={{ textDecoration: 'underline' }}>franchise collection</Link>: check{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new and coming soon</Link>, see the{' '}
            <Link href='/reports/streaming-churn' style={{ textDecoration: 'underline' }}>streaming churn report</Link>.
          </Text>

          <ComparisonLinks exclude='/tv-time-alternative' />

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
