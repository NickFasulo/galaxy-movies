import Link from 'next/link'
import Image from 'next/image'
import { useState, memo, type ReactNode } from 'react'
import { ChakraBox } from './ChakraBox'
import { Box, Badge, Skeleton, Text } from '@chakra-ui/react'
import WatchlistButton from './WatchlistButton'
import type { TitleSummary } from '../types/tmdb'

function MovieCard({ movie, priority = false, badge = null, posterFallback }: { movie: TitleSummary; priority?: boolean; badge?: ReactNode; posterFallback?: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const posterUrl = movie.poster_path
  const isTv = movie.mediaType === 'tv'
  const title = movie.title || movie.name

  return (
    <Box>
      <ChakraBox
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        mx='auto'
        position='relative'
        zIndex={1}
        w='100%'
        boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)'
        borderRadius='0.5rem'
        overflow='hidden'
      >
        <Link href={isTv ? `/tv/${movie.id}` : `/movies/${movie.id}`}>
          <Box position='relative' w='100%' aspectRatio='2/3' bg='gray.800'>
            <Skeleton
              loading={!(isLoaded || !posterUrl)}
              position='absolute'
              inset={0}
              css={{
                '--start-color': 'var(--colors-gray-700)',
                '--end-color': 'var(--colors-gray-900)'
              }}>
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={title || (isTv ? 'Show Poster' : 'Movie Poster')}
                  fill
                  priority={priority}
                  sizes='(max-width: 768px) 45vw, (max-width: 1280px) 25vw, 240px'
                  onLoad={() => setIsLoaded(true)}
                  style={{
                    objectFit: 'cover',
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out'
                  }}
                />
              ) : (
                <Box
                  display='flex'
                  alignItems='center'
                  justifyContent='center'
                  h='100%'
                  p={2}
                  bgImage={posterFallback ? `url(${posterFallback})` : undefined}
                  backgroundSize='cover'
                  backgroundPosition='center'
                >
                  <Text
                    color={posterFallback ? 'gray.100' : 'gray.400'}
                    textAlign='center'
                    fontSize='sm'
                    textShadow={posterFallback ? '0 1px 6px rgba(0,0,0,0.9)' : undefined}
                  >
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
          <WatchlistButton movie={movie} size='xs' />
        </Box>
        {badge && (
          <Box position='absolute' bottom={2} left={2} zIndex={2}>
            {badge}
          </Box>
        )}
      </ChakraBox>
    </Box>
  );
}

export default memo(MovieCard)