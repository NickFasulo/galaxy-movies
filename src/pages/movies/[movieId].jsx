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
import ReviewModal from '../../components/ReviewModal'
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

  const fetchMovie = async () => {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${query.movieId}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}`
      )
      const movieData = await res.json()
      setMovie(movieData)
    } catch (e) {
      throw new Error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchMovie()
  }, [])

  return (
    <Flex
      position='relative'
      justify='center'
      align='center'
      height={{ base: 'auto', md: '100vh' }}
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
          flexDirection={{ base: 'column', md: 'row' }}
          align={{ base: 'center', md: 'normal' }}
        >
          <Flex
            alignItems='center'
            flexDirection='column'
            position='relative'
            margin={{ base: 0, md: '2rem' }}
            width='20rem'
          >
            <Image
              src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
              fallbackSrc='fallback-1.jpg'
              alt={movie.title}
              objectFit='cover'
              width='24rem'
              borderRadius='1rem'
              boxShadow='dark-lg'
              marginTop={{ base: '2rem', md: 0 }}
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
            position='relative'
            flexDirection='column'
            padding='1rem'
            margin={{ base: 0, md: '2rem' }}
            height={{ base: 'auto', md: '30rem' }}
            width={{ base: '100%', md: '40rem' }}
            overflowY={{ base: 'visible', md: 'auto' }}
            borderRadius={{ base: 0, md: '1rem' }}
            background='rgba(0, 0, 0, 0.6)'
            boxShadow='dark-lg'
          >
            <Heading
              color='white'
              textShadow='2px 0 4px black'
              margin={{ base: '1rem auto', md: '1rem 0 0.5rem' }}
            >
              {movie.title}
            </Heading>
            <Flex
              width={{ base: '100%', md: '14rem' }}
              justify={{ base: 'space-evenly', md: 'space-between' }}
            >
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
              textShadow='2px 0 4px black'
              margin={{ base: '1rem auto', md: '1rem 0' }}
            >
              {movie.tagline}
            </Text>
            <Text
              fontSize='lg'
              color='white'
              textShadow='2px 0 4px black'
              marginBottom={{ base: '2rem', md: 0 }}
            >
              {movie.overview}
            </Text>
            <ReviewModal movieTitle={movie.title} />
            <Flex
              align='flex-end'
              justify='space-between'
              marginBottom={{ base: '1rem', md: 0 }}
            >
              <Flex align='center'>
                <StarIcon boxSize={5} color='gold' />
                <Text fontSize='lg' marginLeft={2} color='white'>
                  {movie.vote_average !== 0
                    ? Math.round(movie.vote_average * 10) / 10
                    : 'TBD'}
                </Text>
              </Flex>
              <Flex align='center' justify='flex-end'>
                {movie.production_companies.slice(0, 3).map(company => (
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
