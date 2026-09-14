import Image from 'next/image'
import { useState } from 'react'
import {
  Flex,
  Wrap,
  WrapItem,
  Badge,
  Heading,
  Text,
  Box,
  Avatar
} from '@chakra-ui/react'
import { StarIcon, CalendarIcon, TimeIcon } from '@chakra-ui/icons'
import ReviewModal from '../../components/ReviewModal'
import VideoModal from '../../components/VideoModal'
import BackButton from '../../components/BackButton'
import WatchProviders from '../../components/WatchProviders'
import timeFormatter from '../../utils/timeFormatter'
import dateFormatter from '../../utils/dateFormatter'
import { getFirstPlayableKey } from '../../utils/youtubeCache'

export const getServerSideProps = async (context) => {
  const { movieId } = context.query

  try {
    const [movieRes, providersRes, creditsRes, releaseDatesRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=videos`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${process.env.TMDB_API_KEY}`)
    ])

    if (!movieRes.ok) throw new Error('Failed to fetch movie details')

    const movieData = await movieRes.json()
    const providersData = await providersRes.json()
    const creditsData = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
    const releaseDatesData = releaseDatesRes.ok ? await releaseDatesRes.json() : { results: [] }
    const usRelease = releaseDatesData.results?.find((r) => r.iso_3166_1 === 'US')
    const cert = usRelease?.release_dates?.find((d) => d.certification)?.certification || 'NR'
    const countryCode = context.req.headers['x-vercel-ip-country'] || 'US'
    const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null
    const validVideoKey = await getFirstPlayableKey(movieData.videos?.results)
    const director = creditsData.crew?.find((person) => person.job === 'Director')?.name || null
    const topCast = creditsData.cast?.slice(0, 10) || []

    return {
      props: {
        movie: movieData,
        videoKey: validVideoKey || null,
        watchProviders: userProviders,
        director,
        topCast,
        ageRating: cert
      }
    }
  } catch (error) {
    console.error(error)
    return { notFound: true }
  }
}

export default function Movie({ movie, videoKey, watchProviders, director, topCast, ageRating }) {
  const backdropUrl = movie.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` 
    : movie.poster_path
      ? `https://image.tmdb.org/t/p/w780${movie.poster_path}`
      : '/galaxy-movies-background.png'
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : '/galaxy-movies-background.png'
  const [backdropSrc, setBackdropSrc] = useState(backdropUrl)
  const [posterSrc, setPosterSrc] = useState(posterUrl)

  return (
    <Box position='relative' minH='100vh' bg='#14181c' overflow='hidden'>
      {/* Background Images & Gradients */}
      <Box
        position='absolute'
        top={{ base: 'auto', md: 0 }}
        bottom={{ base: 0, md: 'auto' }}
        left={0}
        right={0}
        h={{ base: '400px', md: '500px' }}
        zIndex={0}
      >
        <Box display={{ base: 'none', md: 'block' }} position='relative' h='100%' w='100%'>
          <Image
            src={backdropSrc}
            alt={movie.title || 'Movie Backdrop'}
            fill
            priority
            sizes='100vw'
            onError={() => setBackdropSrc('/galaxy-movies-background.png')}
            style={{ objectFit: 'cover', objectPosition: 'center 20%' }}
          />
        </Box>
        <Box display={{ base: 'block', md: 'none' }} position='relative' h='100%' w='100%'>
          <Image
            src={backdropSrc}
            alt={movie.title || 'Movie Poster'}
            fill
            priority
            sizes='100vw'
            onError={() => setBackdropSrc('/galaxy-movies-background.png')}
            style={{ objectFit: 'cover', objectPosition: 'center bottom' }}
          />
        </Box>
        <Box
          position='absolute'
          inset={0}
          bgGradient={{
            base: 'linear(to-t, rgba(20,24,28,0.2) 0%, rgba(20,24,28,0.7) 60%, #14181c 100%)',
            md: 'linear(to-b, rgba(20,24,28,0.2) 0%, rgba(20,24,28,0.7) 60%, #14181c 100%)'
          }}
        />
        <Box
          position='absolute'
          inset={0}
          bgGradient={{
            base: 'linear(to-r, #14181c 0%, transparent 20%, transparent 80%, #14181c 100%)',
            md: 'linear(to-r, #14181c 0%, transparent 20%, transparent 80%, #14181c 100%)'
          }}
        />
      </Box>

      {/* Main Container */}
      <Flex position='relative' zIndex={1} justify='center' align='flex-start' minH='100vh' pt={{ base: '4rem', md: '12rem' }} pb={{ base: '2rem', md: '4rem' }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }} justify='center' maxW='1200px' w='100%' px='1rem' gap={{ base: '1.5rem', md: '2.5rem' }}>
          
          {/* Left Column */}
          <Flex align='center' direction='column' position={{ base: 'relative', md: 'sticky' }} top={{ md: '2rem' }} w='20rem' flexShrink={0} gap='1rem'>
            <Box position='relative' w={{ base: '20rem', md: '20rem' }} h={{ base: '30rem', md: '30rem' }}>
              <Image
                src={posterSrc}
                alt={movie.title || 'Movie Poster'}
                fill
                priority
                sizes='(max-width: 768px) 100vw, 320px'
                onError={() => setPosterSrc('/galaxy-movies-background.png')}
                style={{ objectFit: 'cover', borderRadius: '1rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)' }}
              />
            </Box>

            <Wrap justify='center' spacing={{ base: 4, md: 2 }}>
              {movie.genres?.map((genre) => (
                <WrapItem key={genre.id}><Badge>{genre.name}</Badge></WrapItem>
              ))}
            </Wrap>

            <Box w='20rem' maxH='300px' overflowY='auto'>
              <WatchProviders watchProviders={watchProviders} />
            </Box>

          </Flex>

          {/* Right Column */}
          <Flex direction='column' w={{ base: '20rem', md: '40rem' }} maxW='100%' gap='1rem'>
            <Box>
              <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={4} wrap='wrap'>
                <Heading color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                  <Text as='span' display='inline-block'>{movie.title}</Text>
                </Heading>
                <Badge colorScheme='whiteAlpha' bg='rgba(255,255,255,0.1)' color='white' px={2.5} py={1} borderRadius='md' fontSize='xs' border='1px solid' borderColor='whiteAlpha.300' flexShrink={0}>
                  {ageRating}
                </Badge>
              </Flex>
              {director && (
                <Text
                  fontSize='sm'
                  color='gray.400'
                  textShadow='0 0 4px black'
                  mt={{ base: 4, md: 1 }}
                  textAlign={{ base: 'center', md: 'left' }}
                >
                  Directed by <Text as='span' color='white' fontWeight='semibold'>{director}</Text>
                </Text>
              )}
            </Box>

            <Flex
              w={{ base: '100%', md: '14rem' }}
              justify={{ base: 'center', md: 'space-between' }}
              gap={{ base: 4, md: 0 }}
            >
              <Flex align='center'>
                <CalendarIcon color='white' />
                <Text color='white' textShadow='0 0 4px black' ml={1.5}>{dateFormatter(movie.release_date) || 'N/A'}</Text>
              </Flex>
              <Flex align='center'>
                <TimeIcon color='white' />
                <Text color='white' textShadow='0 0 4px black' ml={1.5}>{movie.runtime ? timeFormatter(movie.runtime) : 'N/A'}</Text>
              </Flex>
            </Flex>

            {movie.tagline && (
              <Text as='em' fontSize='lg' color='gray.400' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                "{movie.tagline}"
              </Text>
            )}

            <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
              {movie.overview || 'Description unavailable.'}
            </Text>

            <Flex display={{ base: 'flex', md: 'none' }} direction='row' justify='space-between' align='center' w='100%'>
              <ReviewModal modalData={movie} />
              <VideoModal videoKey={videoKey} />
              <BackButton />
            </Flex>

            <Flex display={{ base: 'none', md: 'flex' }} justify='space-evenly' align='flex-end' gap='3rem'>
              <ReviewModal modalData={movie} />
              <VideoModal videoKey={videoKey} />
              <BackButton />
            </Flex>

            {topCast.length > 0 && (
              <Box mb={4}>
                <Text
                  color='gray.400'
                  fontSize='xs'
                  fontWeight='bold'
                  textTransform='uppercase'
                  textShadow='0 0 4px black'
                  textAlign='center'
                  position='relative'
                  display='flex'
                  alignItems='center'
                  gap={3}
                  mb={2}
                  _before={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                  _after={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                >
                  Cast
                </Text>
                <Wrap spacing={{ base: 4, md: 2 }} justify={{ base: 'center', md: 'flex-start' }}>
                  {topCast.map((actor) => (
                    <WrapItem key={actor.id}>
                      <Flex align='center' bg='rgba(255, 255, 255, 0.1)' px={2.5} py={1} borderRadius='md' gap={2}>
                        {actor.profile_path && <Avatar src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} name={actor.name} size='xs' />}
                        <Text fontSize='xs' color='white' textShadow='0 0 4px black'>{actor.name}</Text>
                      </Flex>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}

            <Flex align='center' justify='space-between' gap={{ base: 4, md: 0 }}>
              <Flex align='center'>
                <StarIcon boxSize={5} color='gold' />
                <Text
                  fontSize='lg'
                  ml={2}
                  color='white'
                  textShadow='2px 0 4px black'
                  textAlign='center'
                >
                  {movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : 'TBD'}
                </Text>
              </Flex>
              <Flex align='center' justify='flex-end'>
                {movie.production_companies?.slice(0, 1).map((company) =>
                  company.logo_path ? (
                    <Box key={company.id} position='relative' w='64px' h='32px'>
                      <Image alt={company.name} src={`https://image.tmdb.org/t/p/w185${company.logo_path}`} fill style={{ objectFit: 'contain', padding: '0.25rem', borderRadius: '0.2rem', background: 'white' }} />
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