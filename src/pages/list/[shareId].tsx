import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import CardBadge from '../../features/catalog/components/CardBadge'
import MovieGrid from '../../features/catalog/components/MovieGrid'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { getRedis, SHARE_LOOKUP_KEY, ALERTS_PREFS_KEY } from '../../features/alerts/waitlistStore'
import type { TitleSummary } from '../../types/tmdb'

interface SharedItem {
  id: number
  mediaType?: 'movie' | 'tv'
  title: string
  poster_path?: string | null
  year?: string | null
}

interface SharedRating extends SharedItem {
  rating: number
}

interface Props {
  watchlist: TitleSummary[]
  ratings: { rating: number; movie: TitleSummary }[]
}

const toSummary = (item: SharedItem): TitleSummary => ({
  id: item.id,
  title: item.title,
  mediaType: item.mediaType === 'tv' ? 'tv' : 'movie',
  poster_path: item.poster_path ?? null
})

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const shareId = String(params?.shareId || '')
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return { notFound: true }

  const kv = getRedis()
  if (!kv) return { notFound: true }

  try {
    const email = await kv.hget<string>(SHARE_LOOKUP_KEY, shareId)
    if (!email) return { notFound: true }

    const prefs = await kv.hget<{ watchlist?: SharedItem[]; ratings?: SharedRating[] }>(ALERTS_PREFS_KEY, email)
    const ratings = (prefs?.ratings || [])
      .filter((r) => typeof r.id === 'number' && r.title)
      .sort((a, b) => b.rating - a.rating)
      .map((r) => ({ rating: r.rating, movie: toSummary(r) }))

    return {
      props: {
        watchlist: (prefs?.watchlist || []).filter((w) => typeof w.id === 'number' && w.title).map(toSummary),
        ratings
      }
    }
  } catch {
    return { notFound: true }
  }
}

export default function SharedList({ watchlist, ratings }: Props) {
  const ratingByKey = new Map(ratings.map((r) => [`${r.movie.mediaType || 'movie'}:${r.movie.id}`, r.rating]))
  return (
    <>
      <PageHead
        title='A shared list on Galaxy Movies'
        description='Someone shared their watchlist and ratings with you.'
        noindex
      />
      <PageShell
        title='A shared list'
        description='Someone shared their watchlist and ratings from Galaxy Movies.'
      >
        {watchlist.length === 0 && ratings.length === 0 ? (
          <Text mt={10} color='gray.400' textAlign='center'>This list is empty right now.</Text>
        ) : (
          <>
            {watchlist.length > 0 && (
              <Box as='section' mt={4}>
                <Heading as='h2' size='md' mb={2}>Watchlist</Heading>
                <MovieGrid movies={watchlist} posterFallback='/poster_fallback_galaxy.webp' />
              </Box>
            )}
            {ratings.length > 0 && (
              <Box as='section' mt={8}>
                <Heading as='h2' size='md' mb={2}>Ratings</Heading>
                <MovieGrid
                  movies={ratings.map((r) => r.movie)}
                  posterFallback='/poster_fallback_galaxy.webp'
                  badgeFor={(movie) => {
                    const rating = ratingByKey.get(`${movie.mediaType || 'movie'}:${movie.id}`)
                    return rating != null ? <CardBadge colorPalette='yellow'>★ {rating}/10</CardBadge> : null
                  }}
                />
              </Box>
            )}
          </>
        )}

        <Box mt={10} maxW='36rem'>
          <Text color='gray.400' fontSize='sm'>
            Keep your own list (plus alerts when it hits your services) on{' '}
            <Link href='/' style={{ textDecoration: 'underline' }}>Galaxy Movies</Link>.
          </Text>
        </Box>
      </PageShell>
    </>
  )
}
