import Link from 'next/link'
import Image from 'next/image'
import { useState, memo } from 'react'
import { ChakraBox } from './ChakraBox'
import { WrapItem, Box, Skeleton, Text } from '@chakra-ui/react'

function MovieCard({ movie, priority = false }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null

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
        <Link href={`/movies/${movie.id}`}>
          <Box position='relative' w='100%' aspectRatio='2/3' bg='gray.800'>
            <Skeleton
              isLoaded={isLoaded || !posterUrl}
              position='absolute'
              inset={0}
              startColor='gray.700'
              endColor='gray.900'
            >
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={movie.title || 'Movie Poster'}
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
                <Box display='flex' align='center' justify='center' h='100%' p={2}>
                  <Text color='gray.400' textAlign='center' fontSize='sm'>
                    {movie.title}
                  </Text>
                </Box>
              )}
            </Skeleton>
          </Box>
        </Link>
      </ChakraBox>
    </WrapItem>
  )
}

export default memo(MovieCard)