import { useState, useEffect } from 'react'
import { Flex, Box, Image, Stack, Badge, Heading, Text } from '@chakra-ui/react'
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
    <Flex position='relative' overflow='hidden' height='100vh'>
      <Image
        src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
        position='absolute'
        filter='auto'
        brightness='35%'
      />
      {loading ? (
        <CustomSpinner />
      ) : (
        <>
          <Flex
            alignItems='center'
            flexDirection='column'
            position='relative'
            margin='2rem'
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
            <Stack direction='row' margin='1rem 0'>
              {movie.genres.map((genre, i) => (
                <Badge key={i}>{genre.name}</Badge>
              ))}
            </Stack>
            <Text
              fontSize='lg'
              align='center'
              color='white'
              textShadow='2px 0 4px black'
            >
              {movie.tagline}
            </Text>
          </Flex>
          <Box
            margin='2rem'
            padding='1rem'
            position='relative'
            height='fit-content'
          >
            <Heading
              margin='1rem 0 2rem'
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
              {movie.overview}
            </Text>
          </Box>
        </>
      )}
    </Flex>
  )
}
