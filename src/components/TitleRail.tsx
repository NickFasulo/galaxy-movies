import Link from 'next/link'
import type { ReactNode } from 'react'
import { Box, Flex, Heading } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import type { TitleSummary } from '../types/tmdb'

export default function TitleRail({ title, href, movies, badgeFor, onCardEnter, onCardLeave }: {
  title: string
  href?: string
  movies: TitleSummary[]
  badgeFor?: (movie: TitleSummary) => ReactNode
  onCardEnter?: (backdropPath: string | null | undefined) => void
  onCardLeave?: () => void
}) {
  if (movies.length === 0) return null

  return (
    <Box as='section' mt={{ base: '2.5rem', md: '3rem' }} mx={{ base: '1.5rem', md: '3rem', xl: 'auto' }} maxW={{ xl: '80rem' }}>
      <Flex align='baseline' justify='space-between' mb={4} gap={3}>
        <Heading as='h2' size='md'>{title}</Heading>
        {href && (
          <Link href={href} style={{ fontSize: 'var(--chakra-font-sizes-xs)', color: 'var(--chakra-colors-gray-400)', whiteSpace: 'nowrap' }}>
            See all →
          </Link>
        )}
      </Flex>
      <Flex
        gap={4}
        overflowX='auto'
        pb={2}
        mx={{ base: '-1.5rem', md: '-3rem', xl: 0 }}
        px={{ base: '1.5rem', md: '3rem', xl: 0 }}
        css={{ scrollSnapType: 'x proximity', scrollbarWidth: 'thin' }}
      >
        {movies.map((movie) => (
          <Box
            key={`${movie.mediaType || 'movie'}:${movie.id}`}
            w={{ base: '8.5rem', md: '10.5rem' }}
            flexShrink={0}
            scrollSnapAlign='start'
            onMouseEnter={() => onCardEnter?.(movie.backdrop_path)}
            onMouseLeave={onCardLeave}
          >
            <MovieCard movie={movie} badge={badgeFor?.(movie)} />
          </Box>
        ))}
      </Flex>
    </Box>
  )
}
