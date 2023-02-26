import { useState, useEffect } from 'react'
import {
  Flex,
  Wrap,
  WrapItem,
  Image,
  Badge,
  Heading,
  Text
} from '@chakra-ui/react'
import { StarIcon, CalendarIcon, TimeIcon } from '@chakra-ui/icons'
import CustomSpinner from '../../components/CustomSpinner'
import timeFormatter from '../../utils/timeFormatter'
import dateFormatter from '../../utils/dateFormatter'

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
    <Flex
      position='relative'
      height={{ sm: 'auto', md: '100vh' }}
      justify='center'
      align='center'
      backgroundColor='dimgrey'
      backgroundBlendMode='multiply'
      backgroundImage={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
      backgroundPosition='center'
      backgroundRepeat='no-repeat'
      backgroundSize='cover'
    >
      {loading ? (
        <CustomSpinner />
      ) : (
        <Flex
          flexDirection={{ sm: 'column', md: 'row' }}
          align={{ sm: 'center', md: 'normal' }}
        >
          <Flex
            alignItems='center'
            flexDirection='column'
            position='relative'
            margin={{ sm: 0, md: '2rem' }}
            width='18rem'
          >
            <Image
              src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
              fallbackSrc='fallback-1.jpg'
              alt={movie.title}
              objectFit='cover'
              width='24rem'
              borderRadius='1rem'
              boxShadow='dark-lg'
              marginTop={{ sm: '2rem', md: 0 }}
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
            margin={{ sm: 0, md: '2rem' }}
            padding='1rem'
            position='relative'
            height={{ sm: 'auto', md: '27rem' }}
            width={{ sm: '96vw', md: '40rem' }}
            flexDirection='column'
            background='rgba(0, 0, 0, 0.6)'
            borderRadius={{ sm: 0, md: '1rem' }}
            boxShadow='dark-lg'
          >
            <Heading
              margin='1rem 0 0.5rem'
              color='white'
              textShadow='2px 0 4px black'
            >
              {movie.title}
            </Heading>
            <Flex width='14rem' justify='space-between'>
              <Flex align='center'>
                <CalendarIcon color='white' />
                <Text
                  color='white'
                  textShadow='2px 0 4px black'
                  marginLeft={1.5}
                >
                  {dateFormatter(movie.release_date)}
                </Text>
              </Flex>
              <Flex align='center'>
                <TimeIcon color='white' />
                <Text
                  color='white'
                  textShadow='2px 0 4px black'
                  marginLeft={1.5}
                >
                  {timeFormatter(movie.runtime)}
                </Text>
              </Flex>
            </Flex>
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
              color='white'
              textShadow='2px 0 4px black'
              marginBottom={{ sm: '2rem', md: 0 }}
            >
              {movie.overview}
            </Text>
            <Flex height='100%' align='flex-end' justify='space-between'>
              <Flex align='center'>
                <StarIcon boxSize={5} color='gold' />
                <Text fontSize='lg' marginLeft={2} color='white'>
                  {movie.vote_average !== 0 ? Math.round(movie.vote_average * 10) / 10 : 'TBD'}
                </Text>
              </Flex>
              <Flex align='center' justify='flex-end'>
                {movie.production_companies.slice(0, 5).map(company => (
                  <Image
                    key={company.id}
                    alt={company.name}
                    src={`https://image.tmdb.org/t/p/original${company.logo_path}`}
                    onError={e => (e.target.style.display = 'none')}
                    width='4rem'
                    margin='0 1rem'
                    padding={0.5}
                    borderRadius={2}
                    background='white'
                  />
                ))}
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      )}
    </Flex>
  )
}
