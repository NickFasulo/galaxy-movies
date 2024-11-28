import Link from 'next/link'
import Image from 'next/image'
import { useState, memo } from 'react'
import { ChakraBox } from './ChakraBox'
import { WrapItem, Box } from '@chakra-ui/react'

function MovieCard({ movie }) {
  const [bgImage, setBgImage] = useState('')
  const [bgOpacity, setBgOpacity] = useState(0)

  const handleMouseEnter = () => {
    const imageUrl = movie.backdrop_path
      ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
      : '/galaxy-movies-background.png'

    setBgImage(imageUrl)
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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Link href={`/movies/${movie.id}`}>
            <Image
              src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
              alt={movie.title}
              width={208}
              height={312}
              placeholder='blur'
              blurDataURL='/fallback-1.jpg'
              style={{
                objectFit: 'cover',
                borderRadius: '1rem'
              }}
            />
          </Link>
        </ChakraBox>
      </WrapItem>

      <img
        src={
          movie.backdrop_path
            ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
            : '/galaxy-movies-background.png'
        }
        alt='Preload'
        style={{ display: 'none' }}
      />
    </>
  )
}

export default memo(MovieCard)
