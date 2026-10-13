import type { ComponentProps, ReactNode } from 'react'
import { Badge, Box, SimpleGrid } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import { useStreamingBadges } from '../hooks/useStreamingBadges'
import type { TitleSummary } from '../types/tmdb'

const nowStreamingBadge = (
  <Badge colorPalette='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
    Now streaming
  </Badge>
)

type MovieGridProps = {
  movies: TitleSummary[]
  posterFallback?: string
  badgeFor?: (movie: TitleSummary) => ReactNode
  onCardEnter?: (backdropPath: string | null | undefined) => void
  onCardLeave?: () => void
} & ComponentProps<typeof SimpleGrid>

// The single card grid for the whole site — same card spec everywhere so
// column counts stay consistent; page containers own the outer width.
export default function MovieGrid({ movies, posterFallback, badgeFor, onCardEnter, onCardLeave, ...gridProps }: MovieGridProps) {
  // Skip the badge lookup entirely when the caller supplies its own badgeFor —
  // an empty list means no ids to fetch, so the hook no-ops.
  const { isStreaming } = useStreamingBadges(badgeFor ? [] : movies)
  const badge = badgeFor ?? ((movie: TitleSummary) => (isStreaming(movie) ? nowStreamingBadge : null))

  return (
    <SimpleGrid
      my={{ base: '2rem', md: '3rem' }}
      gap={{ base: 8, md: 10 }}
      // auto-fill (not auto-fit): empty tracks keep their size so a lone
      // result stays card-width instead of stretching to the full row.
      gridTemplateColumns={{ base: 'repeat(auto-fill, minmax(45%, 1fr))', md: 'repeat(auto-fill, minmax(12rem, 1fr))' }}
      {...gridProps}
    >
      {movies.map((movie, index) => (
        <Box
          key={`${movie.mediaType || 'movie'}:${movie.id}`}
          onMouseEnter={onCardEnter ? () => onCardEnter(movie.backdrop_path) : undefined}
          onMouseLeave={onCardLeave}
        >
          <MovieCard
            movie={movie}
            priority={index < 5}
            badge={badge(movie)}
            posterFallback={posterFallback}
          />
        </Box>
      ))}
    </SimpleGrid>
  )
}
