import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import type { InferGetStaticPropsType } from 'next'
import { Box, Heading, Text } from '@chakra-ui/react'
import CardBadge from '../features/catalog/components/CardBadge'
import MovieGrid from '../features/catalog/components/MovieGrid'
import CardRail from '../features/catalog/components/CardRail'
import Panel from '../components/Panel'
import ServicesPicker from '../features/alerts/components/ServicesPicker'
import WaitlistForm from '../features/alerts/components/WaitlistForm'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import PlusTools from '../features/alerts/components/PlusTools'
import PushAlerts, { PushInstallHint } from '../features/alerts/components/PushAlerts'
import { useUserData } from '../features/alerts/hooks/useUserData'
import { usePlusStatus } from '../features/billing/hooks/usePlus'
import { fetchTmdb } from '../features/catalog/tmdb'
import { backfillRatingMeta, backfillWatchlistMeta, ratingEntries, type RatingMetaPatch } from '../lib/userData'
import { firstParam } from '../lib/http'
import type { MediaType, TitleSummary, TmdbPaged } from '../types/tmdb'

type TrendingItem = TitleSummary & { media_type?: string }

// Build-time trending rail for the empty state — degrades to no rail on a
// keyless build (same fallback contract as other SSG pages).
export async function getStaticProps(): Promise<{ props: { trending: TitleSummary[] }; revalidate: number }> {
  try {
    const data = await fetchTmdb<TmdbPaged<TrendingItem>>('/trending/all/week', { page: 1 })
    const trending = (data?.results || [])
      .filter((item) => item?.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'))
      .map((item) => item.media_type === 'tv'
        ? { ...item, title: item.name, release_date: item.first_air_date, mediaType: 'tv' as const }
        : { ...item, mediaType: 'movie' as const })
      .slice(0, 20)
    return { props: { trending }, revalidate: 21600 }
  } catch (error) {
    console.error(error)
    return { props: { trending: [] }, revalidate: 3600 }
  }
}

export default function Watchlist({ trending }: InferGetStaticPropsType<typeof getStaticProps>) {
  const data = useUserData()
  const { watchlist } = data
  const { loading: plusLoading, creds, plus, features, refresh } = usePlusStatus()
  const { query } = useRouter()
  const traktStatus = firstParam(query.trakt)
  const [picks, setPicks] = useState<TitleSummary[]>([])

  // "Picked for you" reads the same rec index the taste alerts use; posters
  // resolve through the existing batch endpoint.
  useEffect(() => {
    if (!plus || !creds) return
    let cancelled = false
    fetch(`/api/plus-recs?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then(async (body) => {
        const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 20)
        if (!items.length || cancelled) return
        const resp = await fetch('/api/poster-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        })
        const data = await resp.json().catch(() => null)
        if (!cancelled && Array.isArray(data?.results)) {
          setPicks(data.results.map((r: { id: number; title: string; mediaType: string; poster_path: string | null }) => ({
            id: r.id,
            title: r.title,
            mediaType: r.mediaType,
            poster_path: r.poster_path
          })))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [plus, creds])

  // Entries missing posters render as gray cards — resolve them once against
  // TMDB and merge back. The attempted-set prevents refetch loops on titles
  // that genuinely have no poster (e.g. unreleased films).
  const posterAttempts = useRef(new Set<string>())
  const backfillMissingPosters = useCallback((
    ids: { id: number; mediaType?: MediaType }[],
    patch: (results: RatingMetaPatch[]) => void
  ) => {
    const missing = ids.filter((e) => !posterAttempts.current.has(`${e.mediaType || 'movie'}:${e.id}`)).slice(0, 50)
    if (!missing.length) return
    missing.forEach((e) => posterAttempts.current.add(`${e.mediaType || 'movie'}:${e.id}`))
    fetch('/api/poster-paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: missing.map(({ id, mediaType }) => ({ id, mediaType })) })
    })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((body) => {
        if (Array.isArray(body?.results)) patch(body.results)
      })
      .catch(() => missing.forEach((e) => posterAttempts.current.delete(`${e.mediaType || 'movie'}:${e.id}`)))
  }, [])

  useEffect(() => {
    backfillMissingPosters(
      watchlist.filter((e) => !e.poster_path),
      backfillWatchlistMeta
    )
  }, [watchlist, backfillMissingPosters])

  useEffect(() => {
    backfillMissingPosters(
      ratingEntries(data.ratings).filter((e) => !e.poster_path),
      backfillRatingMeta
    )
  }, [data.ratings, backfillMissingPosters])

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

  const ratingByKey = useMemo(() =>
    new Map(rated.map(({ entry, movie }) => [`${movie.mediaType || 'movie'}:${movie.id}`, entry.rating])), [rated])

  return (
    <>
      <PageHead
        title='My List'
        description='Movies you have saved. Your list lives on this device: no account needed.'
        noindex
      />
      <PageShell
        title='My List'
        description="Movies you've saved. Your list lives on this device: no account needed."
        withBackButton
      >
        <Box mt={6}>
          <ServicesPicker />
        </Box>

        {watchlist.length === 0 ? (
          <>
            <Text mt={10} color='gray.400' textAlign='center'>
              Nothing saved yet.{' '}
              <Link href='/' style={{ textDecoration: 'underline' }}>
                Find something to watch
              </Link>{' '}
              and hit the bookmark to save it here.
            </Text>
            {trending.length > 0 && (
              <Box as='section' mt={8}>
                <Heading as='h2' size='md' mb={2}>Start here</Heading>
                <Text color='gray.400' fontSize='sm' mb={4}>
                  Trending this week — tap the bookmark to save one.
                </Text>
                <CardRail
                  movies={trending}
                  posterFallback='/poster_fallback_galaxy.webp'
                  mx='-1.5rem'
                  px='1.5rem'
                />
              </Box>
            )}
          </>
        ) : (
          <MovieGrid movies={watchlist} />
        )}

        {rated.length > 0 && (
          <Box as='section' mt={8}>
            <Heading as='h2' size='md' mb={2}>Your ratings</Heading>
            <Text color='gray.400' fontSize='sm'>
              Ratings shape Galaxy Bot&apos;s picks: the more you rate, the sharper they get.
            </Text>
            <MovieGrid
              movies={rated.map((r) => r.movie)}
              posterFallback='/poster_fallback_galaxy.webp'
              badgeFor={(movie) => {
                const rating = ratingByKey.get(`${movie.mediaType || 'movie'}:${movie.id}`)
                return rating != null ? <CardBadge colorPalette='yellow'>★ {rating}/10</CardBadge> : null
              }}
            />
          </Box>
        )}

        {picks.length > 0 && (
          <Box as='section' mt={8}>
            <Heading as='h2' size='md' mb={1}>Picked for you</Heading>
            <Text color='gray.400' fontSize='sm' mb={4}>
              Because of what you rated highly, refreshed daily.
            </Text>
            <CardRail
              movies={picks}
              posterFallback='/poster_fallback_galaxy.webp'
              mx='-1.5rem'
              px='1.5rem'
            />
          </Box>
        )}

        <Box mt={10} maxW='36rem'>
          <WaitlistForm />
        </Box>

        {!plusLoading && (
          <Panel mt={6} maxW='36rem'>
            {plus && creds ? (
              <PlusTools creds={creds} features={features} refresh={refresh} traktStatus={traktStatus} />
            ) : (
              <>
                <Text color='white' fontWeight='bold' fontSize='sm' mb={1}>Galaxy Plus</Text>
                <Text color='gray.400' fontSize='sm'>
                  {creds
                    ? 'Your list and ratings already sync. Plus adds taste-matched alerts, leaving-soon warnings, and more Galaxy Bot. '
                    : 'Taste-matched alerts, leaving-soon warnings, more Galaxy Bot, and sync across devices. Confirm your email above to get started. '}
                  <br />
                  <Link href='/plus' style={{ textDecoration: 'underline' }}>See Plus →</Link>
                </Text>
              </>
            )}
            {creds ? <PushAlerts creds={creds} /> : <PushInstallHint />}
          </Panel>
        )}
      </PageShell>
    </>
  )
}
