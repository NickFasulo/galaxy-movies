import Link from 'next/link'
import Image from 'next/image'
import { useState, memo, type ReactNode } from 'react'
import { ChakraBox } from './ChakraBox'
import { WrapItem, Box, Badge, Skeleton, Text } from '@chakra-ui/react'
import WatchlistButton from './WatchlistButton'
import type { TitleSummary } from '../types/tmdb'

function MovieCard({ movie, priority = false, badge = null }: { movie: TitleSummary; priority?: boolean; badge?: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const posterUrl = movie.poster_path
  const isTv = movie.mediaType === 'tv'
  const title = movie.title || movie.name

  return (
    <WrapItem>
      <ChakraBox
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        mx='auto'
        position='relative'
        zIndex={1}
        w={{ base: '11rem', md: '13rem' }}
        boxShadow='dark-lg'
        borderRadius='1rem'
        overflow='hidden'
      >
        <Link href={isTv ? `/tv/${movie.id}` : `/movies/${movie.id}`}>
          <Box position='relative' w='100%' aspectRatio='2/3' bg='gray.800'>
            <Skeleton
              loading={!(isLoaded || !posterUrl)}
              position='absolute'
              inset={0}
              css={{
                '--start-color': 'gray.700',
                '--end-color': 'gray.900'
              }}>
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={title || (isTv ? 'Show Poster' : 'Movie Poster')}
                  fill
                  priority={priority}
                  sizes='(max-width: 768px) 176px, 208px'
                  onLoad={() => setIsLoaded(true)}
                  style={{
                    objectFit: 'cover',
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out'
                  }}
                />
              ) : (
                <Box display='flex' alignItems='center' justifyContent='center' h='100%' p={2}>
                  <Text color='gray.400' textAlign='center' fontSize='sm'>
                    {title}
                  </Text>
                </Box>
              )}
            </Skeleton>
          </Box>
        </Link>
        {isTv && (
          <Badge
            position='absolute'
            top={2}
            left={2}
            zIndex={2}
            colorPalette='purple'
            fontSize='2xs'
            px={1.5}
            py={0.5}
            borderRadius='md'
          >
            TV
          </Badge>
        )}
        <Box position='absolute' top={2} right={2} zIndex={2}>
          <WatchlistButton movie={movie} />
        </Box>
        {badge && (
          <Box position='absolute' bottom={2} left={2} zIndex={2}>
            {badge}
          </Box>
        )}
      </ChakraBox>
    </WrapItem>
  );
}

export default memo(MovieCard)