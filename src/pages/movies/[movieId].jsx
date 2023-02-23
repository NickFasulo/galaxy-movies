import { useState, useEffect } from 'react'
import { Box, Image, Stack, Badge } from '@chakra-ui/react'
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

  return (
    <Box>
      {loading ? (
        <CustomSpinner />
      ) : (
        <>
          <Image
            src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
            fallbackSrc='fallback-1.jpg'
            alt={movie.title}
            objectFit='cover'
            margin='2rem'
            width='13rem'
            borderRadius='1rem'
          />
          <Stack direction='row'>
            {movie.genres.map((genre, i) => (
              <Badge key={i}>{genre.name}</Badge>
            ))}
          </Stack>
          <h1>{movie.title}</h1>
        </>
      )}
    </Box>
  )
}
