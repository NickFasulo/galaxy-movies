import { useState, useEffect } from 'react'
import Image from 'next/image'
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

export const getServerSideProps = async context => {
  return {
    props: {
      query: context.query
    }
  }
}

export default function Movie({ query }) {
  const [movie, setMovie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [videoKey, setVideoKey] = useState(null)

  const fetchMovie = async () => {
    try {
      const res = await fetch(`/api/movieDetails?movieId=${query.movieId}`)
      const movieData = await res.json()
      
      const findVideoKey = videos => {
        const officialTrailer = videos?.find(
          video => video.type === 'Trailer' && video.official
        )
        return officialTrailer
          ? officialTrailer.key
          : videos?.find(video => video.type === 'Teaser')?.key || null
      }

      setMovie(movieData)
      setVideoKey(findVideoKey(movieData.videos))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMovie()
  }, [])

  if (loading || !movie) {
    return (
      <Flex minH='100vh' justify='center' align='center' bg='black'>
        <CustomSpinner />
      </Flex>
    )
  }

  const backdropUrl = movie.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` 
    : `https://image.tmdb.org/t/p/w780${movie.poster_path}`
  const posterUrl = `https://image.tmdb.org/t/p/w780${movie.poster_path}`

  return (
    <Box position='relative' minH='100vh' overflow='hidden'>
      <Box position='absolute' inset={0} zIndex={-1}>
        <Box display={{ base: 'none', md: 'block' }} position='relative' h='100%' w='100%'>
          <Image
            src={backdropUrl}
            alt={movie.title || 'Movie Backdrop'}
            fill
            priority
            sizes='100vw'
            style={{ objectFit: 'cover', objectPosition: 'center' }}
          />
        </Box>
        <Box display={{ base: 'block', md: 'none' }} position='relative' h='100%' w='100%'>
          <Image
            src={posterUrl}
            alt={movie.title || 'Movie Poster'}
            fill
            priority
            sizes='100vw'
            style={{ objectFit: 'cover', objectPosition: 'center' }}
          />
        </Box>
        <Box position='absolute' inset={0} bg='blackAlpha.700' />
      </Box>
      <Flex
        position='relative'
        zIndex={1}
        justify='center'
        align='center'
        minH='100vh'
        py={{ base: '2rem', md: '1rem' }}
      >
        <Flex
          flexDirection={{ base: 'column', md: 'row' }}
          align={{ base: 'center', md: 'stretch' }}
          justify='center'
          maxW='1200px'
          w='100%'
          px='1rem'
          gap={{ base: '1.5rem', md: '2rem' }}
        >
          <Flex
            align='center'
            flexDirection='column'
            position='relative'
            width='20rem'
            flexShrink={0}
          >
            <Box position='relative' width='20rem' height='30rem'>
              <Image
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={movie.title || 'Movie Poster'}
                fill
                sizes='(max-width: 768px) 100vw, 320px'
                style={{
                  objectFit: 'cover',
                  borderRadius: '1rem',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
                }}
              />
            </Box>
            <Wrap justify='center' marginTop='1rem'>
              {movie.genres?.map(genre => (
                <WrapItem key={genre.id}>
                  <Badge>{genre.name}</Badge>
                </WrapItem>
              ))}
            </Wrap>
          </Flex>
          <Flex
            position='relative'
            flexDirection='column'
            padding='1.5rem'
            height={{ base: 'auto', md: '30rem' }}
            width={{ base: '100%', md: '40rem' }}
            borderRadius='1rem'
            background='rgba(0, 0, 0, 0.65)'
            boxShadow='dark-lg'
          >
            <Heading
              color='white'
              textShadow='2px 0 4px black'
              textAlign={{ base: 'center', md: 'left' }}
              margin={{ base: '0.5rem auto', md: '0 0 0.5rem' }}
            >
              {movie.title}
            </Heading>
            <Flex
              width={{ base: '100%', md: '14rem' }}
              justify={{ base: 'space-evenly', md: 'space-between' }}
            >
              <Flex align='center'>
                <CalendarIcon color='white' />
                <Text color='white' textShadow='2px 0 4px black' marginLeft={1.5}>
                  {dateFormatter(movie.release_date) || 'N/A'}
                </Text>
              </Flex>
              <Flex align='center'>
                <TimeIcon color='white' />
                <Text color='white' textShadow='2px 0 4px black' marginLeft={1.5}>
                  {movie.runtime ? timeFormatter(movie.runtime) : 'N/A'}
                </Text>
              </Flex>
            </Flex>
            <Text
              as='em'
              fontSize='lg'
              color='gray.400'
              textShadow='2px 0 4px black'
              margin='0.5rem 0'
              textAlign={{ base: 'center', md: 'left' }}
            >
              {movie.tagline}
            </Text>
            <Text
              color='white'
              fontSize='md'
              textShadow='2px 0 4px black'
              marginBottom='1rem'
              overflowY='auto'
              textAlign={{ base: 'center', md: 'left' }}
              flex={1}
            >
              {movie.overview || 'Description unavailable.'}
            </Text>
            <Flex
              justify='space-evenly'
              flexDirection={{ base: 'column', md: 'row' }}
              align={{ base: 'center', md: 'flex-end' }}
              gap={{ base: '2rem', md: '3rem' }}
              margin={{ base: '1rem 0', md: 'auto' }}
            >
              <ReviewModal modalData={movie} />
              <VideoModal videoKey={videoKey} />
              <BackButton />
            </Flex>
            <Flex align='center' justify='space-between' marginTop='1rem'>
              <Flex align='center'>
                <StarIcon boxSize={5} color='gold' />
                <Text fontSize='lg' marginLeft={2} color='white'>
                  {movie.vote_average
                    ? Math.round(movie.vote_average * 10) / 10
                    : 'TBD'}
                </Text>
              </Flex>
              <Flex align='center' justify='flex-end'>
                {movie.production_companies?.slice(0, 1).map(company =>
                  company.logo_path ? (
                    <Box key={company.id} position='relative' width='64px' height='64px'>
                      <Image
                        alt={company.name}
                        src={`https://image.tmdb.org/t/p/w185${company.logo_path}`}
                        fill
                        style={{
                          objectFit: 'contain',
                          padding: '0.25rem',
                          borderRadius: '0.2rem',
                          background: 'white'
                        }}
                      />
                    </Box>
                  ) : null
                )}
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}