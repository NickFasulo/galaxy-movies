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
  { feature: 'Status', galaxy: 'Active: availability refreshed daily', canistreamit: 'Shut down in 2018' },
  { feature: '"Can I stream it?" lookup', galaxy: 'Yes: every movie and show page answers it directly', canistreamit: 'Yes: the original lookup tool' },
  { feature: 'Rent & buy prices', galaxy: 'Yes: real prices across stores, cheapest option highlighted', canistreamit: 'Price links, no comparison' },
  { feature: 'Deep links into providers', galaxy: 'Yes: provider icons open the title itself', canistreamit: 'Yes: early pioneer of deep links' },
  { feature: 'New releases & departures', galaxy: 'Yes: dated daily diffs per service', canistreamit: 'No' },
  { feature: 'Arrival alerts', galaxy: 'Yes: email when a saved title lands on a service', canistreamit: 'No' },
  { feature: 'Recommendations', galaxy: 'Yes: Galaxy Bot picks by mood, group and time limit', canistreamit: 'No' },
  { feature: 'Account required', galaxy: 'No', canistreamit: 'No' },
  { feature: 'Price', galaxy: 'Free', canistreamit: 'Free' }
]

const FAQ_ITEMS = [
  {
    question: 'What happened to Can I Stream It?',
    answer: 'CanIStream.It, the original "where can I watch this" lookup tool, shut down in 2018 when its operator ended the service. Galaxy Movies answers the same question for every movie and TV show, with current US streaming, rental and purchase options.'
  },
  {
    question: 'How do I check where a movie or show is streaming?',
    answer: 'Search for the title on Galaxy Movies: its page lists every service carrying it (subscription, free with ads, rent, or buy), with deep links straight to the title on each provider and the cheapest price called out.'
  },
  {
    question: 'Is Galaxy Movies free?',
    answer: 'Yes. Title lookup, availability, prices and arrival alerts are free; no account is required for browsing.'
  },
  {
    question: 'Where does the data come from?',
    answer: 'Availability and pricing data come from The Movie Database (TMDB) and Watchmode, refreshed daily. Confirm on the provider before you rent — catalogs change.'
  }
]

export default function CanIStreamItAlternative({ movies, dataError }: InferGetStaticPropsType<typeof getStaticProps>) {
  const canonicalUrl = `${SITE_URL}/can-i-stream-it-alternative`
  const title = 'A Free Can I Stream It Alternative for Finding Where to Watch'
  const description = 'CanIStream.It shut down in 2018. Galaxy Movies answers the same question — where can I watch this? — with current streaming, rental and purchase options, prices, and alerts when titles arrive.'

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
          { name: 'Can I Stream It Alternative', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>

          <Text maxW='60rem' mt={8}>
            CanIStream.It was the original answer to <em>can I stream this?</em> — type a title, get the services.
            It shut down in 2018, but the question never went away. Galaxy Movies answers it for every movie and
            TV show: subscription, free-with-ads, rent, or buy, with real prices and links straight to the title
            on each provider.
          </Text>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Galaxy Movies vs Can I Stream It</Heading>
          <Table.ScrollArea border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
            <Table.Root variant='line' size='sm'>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Feature</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Galaxy Movies</Table.ColumnHeader>
                  <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Can I Stream It</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {COMPARISON_ROWS.map(({ feature, galaxy, canistreamit }) => (
                  <Table.Row key={feature}>
                    <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium' whiteSpace='normal'>{feature}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{galaxy}</Table.Cell>
                    <Table.Cell borderColor='whiteAlpha.200' whiteSpace='normal'>{canistreamit}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>What Galaxy Movies adds on top</Heading>
          <Text maxW='60rem'>
            Beyond the lookup, daily catalog diffs show what arrived and left each service this month, a
            leaving-soon list flags last chances, and saved-title alerts email you the day something you want
            lands on a service you have. When the question is not <em>can I stream it</em> but <em>what should I
            stream</em>, Galaxy Bot recommends from a mood, a runtime limit, or who is in the room.
          </Text>
          <Text maxW='60rem' mt={4} color='gray.400' fontStyle='italic'>
            Search a title above, browse by <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>, see{' '}
            <Link href='/new-on-streaming' style={{ textDecoration: 'underline' }}>what is new</Link> and{' '}
            <Link href='/leaving' style={{ textDecoration: 'underline' }}>what is leaving</Link>, or check{' '}
            <Link href='/free' style={{ textDecoration: 'underline' }}>what is streaming free with ads</Link>.
          </Text>

          <ComparisonLinks exclude='/can-i-stream-it-alternative' />

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
