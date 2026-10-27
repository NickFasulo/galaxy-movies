import NextLink from 'next/link'
import type { ReactNode } from 'react'
import { Box, Flex, Heading, Link } from '@chakra-ui/react'
import MovieCard from './MovieCard'
import ScrollRail from './ScrollRail'
import type { TitleSummary } from '../../../types/tmdb'

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
          <Link color='gray.300' fontSize='xs' whiteSpace='nowrap' transition='color 0.15s' _hover={{ color: 'white' }} asChild>
            <NextLink href={href}>See all →</NextLink>
          </Link>
        )}
      </Flex>
      <ScrollRail
        gap={4}
        // Scroll containers clip at the padding box — the card shadow needs
        // ~20px below and the hover scale a few px all around, so pad the
        // scrollport and pull it back with negative margins to keep the
        // cards' visual position unchanged.
        mt={-2} mb={-4} pt={2} pb={6}
        mx={{ base: '-1.5rem', md: '-3rem', xl: '-0.5rem' }}
        px={{ base: '1.5rem', md: '3rem', xl: '0.5rem' }}
        css={{ scrollSnapType: 'x proximity' }}
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
      </ScrollRail>
    </Box>
  )
}
