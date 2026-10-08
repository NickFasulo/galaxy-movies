import { Badge, SimpleGrid } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import { useStreamingBadges } from '../hooks/useStreamingBadges'
import type { TitleSummary } from '../types/tmdb'

const nowStreamingBadge = (
  <Badge colorPalette='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
    Now streaming
  </Badge>
)

export default function MovieGrid({ movies }: { movies: TitleSummary[] }) {
  const isStreaming = useStreamingBadges(movies)

  return (
    <SimpleGrid
      my={{ base: '2rem', md: '3rem' }}
      gap={{ base: 8, md: 10 }}
      minChildWidth={{ base: '45%', md: '12rem' }}
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
