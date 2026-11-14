import type { InferGetStaticPropsType } from 'next'
import Link from 'next/link'
import {
  Box,
  Heading,
  Text
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

const FAQ_ITEMS = [
  {
    question: 'Is there a Letterboxd alternative without a social feed?',
    answer: 'Yes. Galaxy Movies is a free tracker for films and TV shows with no public profile, no followers and no feed. Your watchlist, ratings and watched diary stay on your device, and no account is required. Simkl and Moviebase also work without engaging with their social features, though both carry optional public profiles.'
  },
  {
    question: 'What is the best private movie tracking app?',
    answer: 'For films and TV tracked privately with no account at all, Galaxy Movies is the simplest option: everything saves on your device and syncs only if you opt into email alerts or Trakt sync. If you want automatic scrobbling from a media server, Trakt is the stronger pick, but it centres on an account and a public profile.'
  },
  {
    question: 'Can I import my Letterboxd watchlist?',
    answer: 'Yes. Galaxy Movies imports Letterboxd CSV exports (watchlist.csv, ratings.csv and diary entries) directly in the browser on the list page, free, with no sign-up. TV Time and IMDb exports import the same way.'
  },
  {
    question: 'Is Letterboxd free?',
    answer: 'Yes, the core diary, lists and reviews are free. Paid Pro and Patron tiers remove ads and add extras like streaming-service filters and watchlist notifications.'
  }
]

export default function LetterboxdAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/letterboxd-alternative`
  const title = 'Letterboxd alternatives for people who just want a private watchlist'
  const description = 'Letterboxd is built around a public social feed. If you want to track films and keep a watchlist without the social layer, these are the apps worth trying.'

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
          { name: 'Letterboxd Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            Letterboxd is good at what it does. But what it does is social: your diary is public by
            default, your lists are built to be shared, and the whole experience is organised around
            other people seeing what you watch. If that is not what you want from a tracker, these
            are the alternatives worth a look.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies</Heading>
          <Text maxW='60rem'>
            Galaxy Movies is a free tracker for films and TV shows with no social layer at all: no
            public profile, no followers, no feed. You save a title and it goes in your watchlist.
            You rate it and it goes in your diary. Nothing is published anywhere, because there is
            no account to publish from: your list lives on your device, and alerts over email are
            the only opt-in that touches our servers.
          </Text>
          <Text maxW='60rem' mt={4}>
            It also answers the questions Letterboxd does not try to: where each film is streaming
            tonight, what it costs to rent, when it is leaving your service, and what to watch next
            via Galaxy Bot. Letterboxd exports (watchlist, ratings and diary CSVs) import free in
            the browser, and the whole thing runs in the browser on iOS, Android and desktop. You
            can install it to your home screen like an app, but there is nothing to download.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Trakt</Heading>
          <Text maxW='60rem'>
            Trakt is the power-user option. It tracks films and TV automatically through Plex, Kodi
            and media-server scrobbles, which no other app here does. Public profiles and comments
            exist but sit well behind the tracking. The catch: it is built around an account and
            sync, leans toward TV rather than film, and the hands-off automation is the reason to
            pick it. If you only want a private list, it is more machinery than you need.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Simkl</Heading>
          <Text maxW='60rem'>
            Simkl covers films, TV and anime from one watchlist, and its browser extension can pull
            viewing history straight out of Netflix and other services. Public profiles exist but
            are easy to ignore. Its strength is breadth across media types, so if anime and TV
            tracking matter as much as film, it is a reasonable home. The interface is busy, and
            the account is not optional.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Moviebase</Heading>
          <Text maxW='60rem'>
            Moviebase is a capable mobile-first tracker for films and TV with watchlists, ratings
            and a watched history, plus Trakt sync if you want it. No feed worth speaking of, and
            it works fine used privately. It leans into TV tracking and its paid tier, so film-only
            users will find parts of it irrelevant.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Which one is right for you</Heading>
          <Text maxW='60rem'>
            If you want no social layer, no account, and films rather than a feed, Galaxy Movies is
            the straightforward choice: open it and start a list. If you want TV tracking alongside
            film, Moviebase or Simkl cover more ground. If you want your viewing logged for you
            without thinking about it, Trakt is the one.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, <Link href='/lists' style={{ textDecoration: 'underline' }}>curated list</Link>, or{' '}
            <Link href='/collections' style={{ textDecoration: 'underline' }}>franchise collection</Link>: check{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new and coming soon</Link>, see what is{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>leaving your services</Link>, or open your{' '}
            <Link href='/watchlist' style={{ textDecoration: 'underline' }}>private watchlist</Link> to import a Letterboxd export.
          </Text>

          <ComparisonLinks exclude='/letterboxd-alternative' />

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
