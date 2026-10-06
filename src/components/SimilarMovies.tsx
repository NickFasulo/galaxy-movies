import Image from 'next/image'
import Link from 'next/link'
import { Box, Flex, Text, Wrap, WrapItem } from '@chakra-ui/react'
import type { SimilarTitle } from '../utils/similarMovies'

export default function SimilarMovies({ movies }: { movies?: SimilarTitle[] | null }) {
  if (!movies || movies.length === 0) return null

  return (
    <Box mb={4}>
      <Text
        color='gray.400'
        fontSize='xs'
        fontWeight='bold'
        textTransform='uppercase'
        textShadow='0 0 4px black'
        textAlign='center'
        position='relative'
        display='flex'
        alignItems='center'
        gap={3}
        mb={2}
        _before={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
        _after={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
      >
        More Like This
      </Text>
      <Wrap gap={3} justify='center'>
        {movies.map((movie) => (
          <WrapItem key={movie.id} w='15.5rem' maxW='100%'>
            <Link href={`/${movie.mediaType === 'tv' ? 'tv' : 'movies'}/${movie.id}`} passHref>
              <Flex
                bg='rgba(255, 255, 255, 0.1)'
                borderRadius='0.5rem'
                p={3}
                gap={3}
                w='100%'
                cursor='pointer'
                transition='all 0.2s ease-in-out'
                _hover={{ bg: 'rgba(255, 255, 255, 0.2)', transform: 'translateY(-2px)' }}
              >
                <Box position='relative' w='3.25rem' h='4.875rem' flexShrink={0} borderRadius='0.3rem' overflow='hidden' bg='gray.800'>
                  {movie.posterPath && (
                    <Image
                      src={movie.posterPath}
                      alt={movie.title}
                      fill
                      sizes='52px'
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </Box>
                <Box minW={0}>
                  <Text color='white' fontWeight='semibold' fontSize='sm' lineClamp={1}>
                    {movie.title}
                  </Text>
                  <Text color='gray.300' fontSize='xs' mt={1} lineClamp={3}>
                    {movie.reason}
                  </Text>
                </Box>
              </Flex>
            </Link>
          </WrapItem>
        ))}
      </Wrap>
    </Box>
  );
}
