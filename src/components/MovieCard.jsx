import { ChakraBox } from './ChakraBox'
import { Image, WrapItem } from '@chakra-ui/react'
import Link from 'next/link'

export default function MovieCard({ movie }) {
  return (
    <WrapItem>
      <ChakraBox
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        margin='2rem'
        width={{ base: '80vw', md: '13rem' }}
        boxShadow='dark-lg'
        borderRadius='1.1rem'
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
  )
}
