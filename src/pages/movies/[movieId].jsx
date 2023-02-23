import { useState, useEffect } from 'react'
import {
  Flex,
  Wrap,
  WrapItem,
  Box,
  Image,
  Badge,
  Heading,
  Text
} from '@chakra-ui/react'
import CustomSpinner from '../../components/CustomSpinner'

export const getServerSideProps = async context => {
  return {
    props: {
      query: context.query
    }
  }
}

export default function Movie({ query }) {
  const [movie, setMovie] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return async () => {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${query.movieId}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}`
      )
      const movieData = await res.json()
      setMovie(movieData)
      setLoading(false)
    }
  }, [])

  console.log(movie)

  return (
    <Flex
      position='relative'
      overflow='hidden'
      height='100vh'
      justify='center'
      align='center'
    >
      <Image
        src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
        position='absolute'
        filter='auto'
        brightness='35%'
      />
      {loading ? (
        <CustomSpinner />
      ) : (
        <Flex>
          <Flex
            alignItems='center'
            flexDirection='column'
            position='relative'
            margin='2rem'
            width='18rem'
          >
            <Image
              src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
              fallbackSrc='fallback-1.jpg'
              alt={movie.title}
              objectFit='cover'
              width='16rem'
              borderRadius='1rem'
              boxShadow='dark-lg'
            />
            <Wrap justify='center' margin='2rem 0'>
              {movie.genres.map(genre => (
                <WrapItem>
                  <Badge key={genre.id}>{genre.name}</Badge>
                </WrapItem>
              ))}
            </Wrap>
          </Flex>
          <Flex
            margin='2rem'
            padding='1rem'
            position='relative'
            height='24rem'
            flexDirection='column'
            background='rgba(0, 0, 0, 0.6)'
            borderRadius='1rem'
          >
            <Heading
              margin='1rem 0 0'
              color='white'
              textShadow='2px 0 4px black'
            >
              {movie.title}
            </Heading>
            <Text
              fontSize='lg'
              width='40rem'
              color='white'
              textShadow='2px 0 4px black'
            >
              {new Date(movie.release_date).toLocaleDateString('en-us', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </Text>
            <Text
              as='em'
              fontSize='lg'
              color='gray.400'
              margin='1rem 0'
              textShadow='2px 0 4px black'
            >
              {movie.tagline}
            </Text>
            <Text
              fontSize='lg'
              width='40rem'
              color='white'
              textShadow='2px 0 4px black'
            >
              {movie.overview}
            </Text>
            <Flex align='center' justify='flex-end' height='100%'>
              {movie.production_companies.map(company => (
                <Image
                  key={company.id}
                  alt={company.name}
                  src={`https://image.tmdb.org/t/p/original${company.logo_path}`}
                  onError={e => (e.target.style.display = 'none')}
                  width='4rem'
                  margin='0 1rem'
                  padding={1}
                  borderRadius={2}
                  background='white'
                />
              ))}
            </Flex>
          </Flex>
        </Flex>
      )}
    </Flex>
  )
}
