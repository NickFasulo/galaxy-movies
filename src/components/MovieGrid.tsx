import { Badge, SimpleGrid } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import { useStreamingBadges } from '../hooks/useStreamingBadges'
import type { TitleSummary } from '../types/tmdb'

const nowStreamingBadge = (
  <Badge colorScheme='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
    Now streaming
  </Badge>
)

export default function MovieGrid({ movies }: { movies: TitleSummary[] }) {
  const isStreaming = useStreamingBadges(movies)

  return (
    <SimpleGrid
      margin={{ base: '2rem 1rem', md: '3rem 5rem' }}
      spacingX={{ base: 8, md: 12, xl: 4 }}
      spacingY={{ base: 8, md: 12 }}
      columns={{ base: 2, md: 5 }}
    >
      {movies.map((movie, index) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          priority={index < 5}
          badge={isStreaming(movie) ? nowStreamingBadge : null}
        />
      ))}
    </SimpleGrid>
  )
}
