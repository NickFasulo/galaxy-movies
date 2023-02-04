import { ChakraBox } from './chakraBox'
import { Image, WrapItem } from '@chakra-ui/react'

export default function MovieCard({ poster_path, title }) {
  return (
    <WrapItem>
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
          src={`https://image.tmdb.org/t/p/original${poster_path}`}
          fallbackSrc='fallback-1.jpg'
          alt={title}
          objectFit='cover'
          borderRadius='1rem'
        />
      </ChakraBox>
    </WrapItem>
  )
}
