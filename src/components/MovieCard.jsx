import { ChakraBox } from './ChakraBox'
import { Image, WrapItem } from '@chakra-ui/react'
import Link from 'next/link'

export default function MovieCard({ movie }) {
  return (
    <WrapItem>
      <Link href={`/movies/${movie.id}`}>
        <ChakraBox
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          margin='2rem'
          width='13rem'
          cursor='pointer'
          boxShadow='dark-lg'
          borderRadius='1.1rem'
        >
          <Image
            src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
            fallbackSrc='fallback-1.jpg'
            alt={movie.title}
            objectFit='cover'
            borderRadius='1rem'
          />
        </ChakraBox>
      </Link>
    </WrapItem>
  )
}
