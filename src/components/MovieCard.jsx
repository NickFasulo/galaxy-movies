import Link from 'next/link'
import Image from 'next/image'
import { useState, memo } from 'react'
import { ChakraBox } from './ChakraBox'
import { WrapItem, Box, Skeleton } from '@chakra-ui/react'

function MovieCard({ movie }) {
  const [bgImage, setBgImage] = useState('')
  const [bgOpacity, setBgOpacity] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  const backdropUrl = movie.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    : '/galaxy-movies-background.png'

  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null

  const handleMouseEnter = () => {
    const img = new window.Image()
    img.src = backdropUrl

    setBgImage(backdropUrl)
    setBgOpacity(0.3)
  }

  const handleMouseLeave = () => {
    setBgOpacity(0)
    setTimeout(() => {
      setBgImage('')
    }, 300)
  }

  return (
    <>
      {bgImage && (
        <Box
          position='fixed'
          top={-1}
          left={-1}
          right={-1}
          bottom={-1}
          zIndex={-1}
          bgSize='cover'
          bgPosition='center'
          bgImage={`url(${bgImage})`}
          transition='opacity 0.3s ease-in-out'
          opacity={bgOpacity}
        />
      )}
      <Box
        position='fixed'
        top={-1}
        left={-1}
        right={-1}
        bottom={-1}
        zIndex={-1}
        pointerEvents='none'
        bg='radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0, 0, 0, 1) 100%)'
        transition='opacity 0.3s ease-in-out'
        opacity={bgOpacity}
      />
      <WrapItem>
        <ChakraBox
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          mx='auto'
          width={{ base: '11rem', md: '13rem' }}
          boxShadow='dark-lg'
          borderRadius='1.1rem'
          overflow='hidden'
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Link href={`/movies/${movie.id}`} passHref legacyBehavior>
            <Box
              as='a'
              display='block'
              position='relative'
              width='100%'
              paddingTop='150%'
              bg='gray.800'
            >
              <Skeleton
                isLoaded={isLoaded}
                position='absolute'
                top={0}
                left={0}
                width='100%'
                height='100%'
                startColor='gray.700'
                endColor='gray.900'
              >
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={movie.title || 'Movie Poster'}
                    fill
                    sizes='(max-width: 768px) 176px, 208px'
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
                    height='100%'
                    p={2}
                  >
                    <span style={{ color: '#A0AEC0', textAlign: 'center' }}>
                      {movie.title}
                    </span>
                  </Box>
                )}
              </Skeleton>
            </Box>
          </Link>
        </ChakraBox>
      </WrapItem>
    </>
  )
}

export default memo(MovieCard)