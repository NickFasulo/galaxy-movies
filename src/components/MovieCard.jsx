import { ChakraBox } from './ChakraBox'
import { Image, WrapItem, Box } from '@chakra-ui/react'
import Link from 'next/link'
import { useState } from 'react'

export default function MovieCard({ movie }) {
  const [bgImage, setBgImage] = useState('')
  const [bgOpacity, setBgOpacity] = useState(0)

  const handleMouseEnter = () => {
    setBgImage(`https://image.tmdb.org/t/p/original${movie.poster_path}`)
    setBgOpacity(0.25)
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
        top={-5}
        left={-5}
        right={-5}
        bottom={-5}
        bgImage={`url(${bgImage})`}
        bgSize='cover'
        bgPosition='center'
        zIndex={-1}
        transition='opacity 0.3s ease-in-out'
        opacity={bgOpacity}
      />

      <WrapItem>
        <ChakraBox
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          margin='2rem'
          width={{ base: '80vw', md: '13rem' }}
          boxShadow='dark-lg'
          borderRadius='1.1rem'
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Link href={`/movies/${movie.id}`}>
            <Image
              src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
              fallbackSrc='fallback-1.jpg'
              alt={movie.title}
              objectFit='cover'
              borderRadius='1rem'
            />
          </Link>
        </ChakraBox>
      </WrapItem>
    </>
  )
}

