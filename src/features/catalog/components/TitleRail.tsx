import NextLink from 'next/link'
import type { ReactNode } from 'react'
import { Box, Flex, Heading, Link } from '@chakra-ui/react'
import CardRail from './CardRail'
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
      <CardRail
        movies={movies}
        badgeFor={badgeFor}
        onCardEnter={onCardEnter}
        onCardLeave={onCardLeave}
        mx={{ base: '-1.5rem', md: '-3rem', xl: '-0.5rem' }}
        px={{ base: '1.5rem', md: '3rem', xl: '0.5rem' }}
      />
    </Box>
  )
}
