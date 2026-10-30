import type { ReactNode } from 'react'
import { Box, type FlexProps } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import ScrollRail from './ScrollRail'
import type { TitleSummary } from '../../../types/tmdb'

interface CardRailProps extends Omit<FlexProps, 'children'> {
  movies: TitleSummary[]
  badgeFor?: (movie: TitleSummary) => ReactNode
  posterFallback?: string
  onCardEnter?: (backdropPath: string | null | undefined) => void
  onCardLeave?: () => void
}

// The one MovieCard rail — pads the scrollport so the card shadow and hover
// scale aren't clipped, pulled back with negative margins so cards keep their
// visual position. Callers only pass the mx/px bleed that cancels their
// container's padding; custom children belong on ScrollRail instead.
export default function CardRail({ movies, badgeFor, posterFallback, onCardEnter, onCardLeave, css, ...rest }: CardRailProps) {
  return (
    <ScrollRail
      gap={4}
      mt={-2} mb={-4} pt={2} pb={6}
      css={{ scrollSnapType: 'x proximity', ...css }}
      {...rest}
    >
      {movies.map((movie) => (
        <Box
          key={`${movie.mediaType || 'movie'}:${movie.id}`}
          w={{ base: '8.5rem', md: '10.5rem' }}
          flexShrink={0}
          scrollSnapAlign='start'
          onMouseEnter={onCardEnter ? () => onCardEnter(movie.backdrop_path) : undefined}
          onMouseLeave={onCardLeave}
        >
          <MovieCard movie={movie} badge={badgeFor?.(movie)} posterFallback={posterFallback} />
        </Box>
      ))}
    </ScrollRail>
  )
}
