import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Badge, Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import MovieCard from '../components/MovieCard'
import ServicesPicker from '../components/ServicesPicker'
import WaitlistForm from '../components/WaitlistForm'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { useUserData } from '../hooks/useUserData'
import { usePlusStatus } from '../hooks/usePlus'
import { fetchSyncedPrefs } from '../utils/alertsSync'
import { backfillRatingMeta, ratingEntries } from '../utils/userData'
import type { TitleSummary } from '../types/tmdb'

export default function Watchlist() {
  const data = useUserData()
  const { watchlist } = data
  const { loading: plusLoading, creds, plus } = usePlusStatus()

  // Ratings written before poster_path existed render as gray cards — resolve
  // them against TMDB once and merge back; the change re-syncs server-side too.
  useEffect(() => {
    const missing = ratingEntries(data.ratings).filter((e) => !e.poster_path).slice(0, 50)
    if (!missing.length) return
    fetch('/api/poster-paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: missing.map(({ id, mediaType }) => ({ id, mediaType })) })
    })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((body) => {
        if (Array.isArray(body?.results)) backfillRatingMeta(body.results)
      })
      .catch(() => {})
  }, [data.ratings])

  const exportData = async () => {
    if (!creds) return
    const prefs = await fetchSyncedPrefs(creds)
    if (!prefs) return
    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'galaxy-movies-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const rated = useMemo(() =>
    ratingEntries(data.ratings)
      .sort((a, b) => b.rating - a.rating)
      .map((entry) => ({
        entry,
        movie: {
          id: entry.id,
          title: entry.title,
          mediaType: entry.mediaType,
          poster_path: entry.poster_path ?? null
        } as TitleSummary
      })), [data.ratings])

  return (
    <>
      <PageHead
        title='My List'
        description='Movies you have saved. Your list lives on this device — no account needed.'
        noindex
      />
      <PageShell
        title='My List'
        description="Movies you've saved. Your list lives on this device — no account needed."
        withBackButton
      >
        <Box mt={6}>
          <ServicesPicker />
        </Box>

        {watchlist.length === 0 ? (
          <Text mt={10} color='gray.400' textAlign='center'>
            Nothing saved yet.{' '}
            <Link href='/' style={{ textDecoration: 'underline' }}>
              Find something to watch
            </Link>{' '}
            and hit the bookmark to save it here.
          </Text>
        ) : (
          <MovieGrid movies={watchlist} />
        )}

        {rated.length > 0 && (
          <Box as='section' mt={8}>
            <Heading as='h2' size='md' mb={2}>Your ratings</Heading>
            <Text color='gray.400' fontSize='sm'>
              Ratings shape Galaxy Bot&apos;s picks — the more you rate, the sharper they get.
            </Text>
            <SimpleGrid
              my={{ base: '2rem', md: '3rem' }}
              gap={{ base: 8, md: 10 }}
              minChildWidth={{ base: '45%', md: '12rem' }}
            >
              {rated.map(({ entry, movie }) => (
                <MovieCard
                  key={`${movie.mediaType || 'movie'}:${movie.id}`}
                  movie={movie}
                  posterFallback='/poster_fallback_galaxy.webp'
                  badge={
                    <Badge colorPalette='yellow' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
                      ★ {entry.rating}/10
                    </Badge>
                  }
                />
              ))}
            </SimpleGrid>
          </Box>
        )}

        <Box mt={10} maxW='36rem'>
          <WaitlistForm />
        </Box>

        {!plusLoading && (
          <Box mt={6} maxW='36rem' bg='blackAlpha.500' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4}>
            {plus && creds ? (
              <>
                <Flex align='center' gap={2} mb={1}>
                  <Badge colorPalette='yellow'>Plus</Badge>
                  <Text color='white' fontWeight='bold' fontSize='sm'>Galaxy Plus is active</Text>
                </Flex>
                <Text color='gray.400' fontSize='sm'>
                  <a
                    href={`/api/billing/portal?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`}
                    style={{ textDecoration: 'underline' }}
                  >
                    Manage subscription
                  </a>
                  {' · '}
                  <button type='button' onClick={exportData} style={{ textDecoration: 'underline' }}>
                    Export my data
                  </button>
                </Text>
              </>
            ) : (
              <>
                <Text color='white' fontWeight='bold' fontSize='sm' mb={1}>Galaxy Plus</Text>
                <Text color='gray.400' fontSize='sm'>
                  {creds
                    ? 'Your list and ratings already sync — Plus adds taste-matched alerts, leaving-soon warnings, and more Galaxy Bot. '
                    : 'Taste-matched alerts, leaving-soon warnings, more Galaxy Bot, and sync across devices. Confirm your email above to get started. '}
                  <br />
                  <Link href='/plus' style={{ textDecoration: 'underline' }}>See Plus →</Link>
                </Text>
              </>
            )}
          </Box>
        )}
      </PageShell>
    </>
  )
}
