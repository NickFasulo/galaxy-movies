import { useState, useEffect } from 'react'
import {
  Flex,
  Wrap,
  WrapItem,
  Badge,
  Heading,
  Text,
  Box
} from '@chakra-ui/react'
import { StarIcon, CalendarIcon, TimeIcon } from '@chakra-ui/icons'
import CustomSpinner from '../../components/CustomSpinner'
import ReviewModal from '../../components/ReviewModal'
import VideoModal from '../../components/VideoModal'
import BackButton from '../../components/BackButton'
import timeFormatter from '../../utils/timeFormatter'
import dateFormatter from '../../utils/dateFormatter'
import Image from 'next/image'

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
  const [videoKey, setVideoKey] = useState(null)

  const fetchMovie = async () => {
    try {
      const res = await fetch(`/api/movieDetails?movieId=${query.movieId}`)
      const movieData = await res.json()
      const findVideoKey = videos => {
        const officialTrailer = videos.find(
          video => video.type === 'Trailer' && video.official
        )
        return officialTrailer
          ? officialTrailer.key
          : videos.find(video => video.type === 'Teaser')?.key || null
      }

      setMovie(movieData)
      setVideoKey(findVideoKey(movieData.videos))
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
      maxHeight='100%'
      backgroundColor='dimgrey'
      backgroundBlendMode='multiply'
      backgroundImage={{
        base: `https://image.tmdb.org/t/p/original${movie.poster_path}`,
        md: `https://image.tmdb.org/t/p/original${movie.backdrop_path || movie.poster_path}`
      }}
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
            align='center'
            flexDirection='column'
            position='relative'
            margin={{ base: 0, md: '2rem' }}
            width='20rem'
          >
            <Box marginTop={{ base: '2rem', md: 0 }}>
              <Image
                src={`https://image.tmdb.org/t/p/original${movie.poster_path}`}
                alt={movie.title}
                width={384}
                height={576}
                style={{
                  objectFit: 'cover',
                  borderRadius: '1rem',
                  boxShadow: 'dark-lg'
                }}
              />
            </Box>
            <Wrap justify='center' margin='2rem 0'>
              {movie.genres.map(genre => (
                <WrapItem key={genre.id}>
                  <Badge>{genre.name}</Badge>
                </WrapItem>
              ))}
            </Wrap>
          </Flex>
          <Flex
            position='relative'
            flexDirection='column'
            padding={{ base: '1.5rem', md: '1.5rem' }}
            margin={{ base: 0, md: '2rem' }}
            height={{ base: 'auto', md: '30rem' }}
            width={{ base: '100%', md: '40rem' }}
            borderRadius={{ base: 0, md: '1rem' }}
            background='rgba(0, 0, 0, 0.6)'
            boxShadow='dark-lg'
          >
            <Heading
              color='white'
              textShadow='2px 0 4px black'
              textAlign={{ base: 'center', md: 'left' }}
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
                  {movie.runtime != 0 ? timeFormatter(movie.runtime) : 'N/A'}
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
              height='100%'
              maxWidth='100%'
              color='white'
              fontSize='lg'
              textShadow='2px 0 4px black'
              marginBottom={{ base: '1.5rem', md: 0 }}
              overflowY={{ base: 'visible', md: 'auto' }}
            >
              {movie.overview}
            </Text>
            <Flex
              justify='space-evenly'
              flexDirection={{ base: 'column', md: 'row' }}
              align={{ base: 'center', md: 'flex-end' }}
            >
              <ReviewModal modalData={movie} />
              <VideoModal videoKey={videoKey} />
              <BackButton />
            </Flex>
            <Flex
              align='flex-end'
              justify='space-between'
              margin={{ base: '1.5rem 0 1rem', md: 0 }}
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
                {movie.production_companies.slice(0, 1).map(company =>
                  company.logo_path ? (
                    <Image
                      key={company.id}
                      alt={company.name}
                      src={`https://image.tmdb.org/t/p/original${company.logo_path}`}
                      width={64}
                      height={64}
                      style={{
                        margin: '0 1rem',
                        padding: '0.5rem',
                        borderRadius: '0.2rem',
                        background: 'white'
                      }}
                    />
                  ) : null
                )}
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      )}
    </Flex>
  )
}
