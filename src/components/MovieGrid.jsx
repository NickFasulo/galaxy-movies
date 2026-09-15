import { SimpleGrid } from '@chakra-ui/react'
import MovieCard from './MovieCard'

export default function MovieGrid({ movies }) {
  return (
    <SimpleGrid
      margin={{ base: '2rem 1rem', md: '3rem 5rem' }}
      spacing={{ base: 8, md: 12 }}
      columns={{ base: 2, md: 5 }}
    >
      {movies.map((movie, index) => (
        <MovieCard key={movie.id} movie={movie} priority={index < 5} />
      ))}
    </SimpleGrid>
  )
}
