import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
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
import ReviewModal from '../../components/ReviewModal'
import VideoModal from '../../components/VideoModal'
import BackButton from '../../components/BackButton'
import ProductionLogo from '../../components/ProductionLogo'
import WatchProviders from '../../components/WatchProviders'
import ActorAvatar from '../../components/ActorAvatar'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
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

    if (!movieRes.ok) {
      if (movieRes.status === 404) return { notFound: true }
      return {
        props: {
          movieError: movieRes.status === 401
            ? 'Movie data is unavailable because the configured TMDB API key was rejected.'
            : 'Movie data is temporarily unavailable. Please try again later.'
        }
      }
    }

    const movieData = await movieRes.json()
    const providersData = await providersRes.json()
    const creditsData = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
    const releaseDatesData = releaseDatesRes.ok ? await releaseDatesRes.json() : { results: [] }
    const usRelease = releaseDatesData.results?.find((r) => r.iso_3166_1 === 'US')
    const cert = usRelease?.release_dates?.find((d) => d.certification)?.certification || 'NR'
    const countryCode = context.req.headers['x-vercel-ip-country'] || 'US'
    const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null
    const validVideoKey = await getFirstPlayableKey(movieData.videos?.results)
    const directorObj = creditsData.crew?.find((person) => person.job === 'Director')
    const director = directorObj ? { id: directorObj.id, name: directorObj.name } : null
    const topCast = creditsData.cast?.slice(0, 15) || []

    if (context.res) {
      context.res.setHeader(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=86400'
      )
    }

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
    return {
      props: {
        movieError: 'Movie data is temporarily unavailable. Please try again later.'
      }
    }
  }
}

export default function Movie({ movie, movieError, videoKey, watchProviders, director, topCast, ageRating }) {
  if (movieError) {
    return (
      <>
        <Head>
          <title>Movie unavailable | Galaxy Movies</title>
          <meta name='description' content={movieError} />
        </Head>
        <Box minH='100vh' p={8} textAlign='center'>
          <Text mt={20}>{movieError}</Text>
          <Link href='/'>Return to Galaxy Movies</Link>
        </Box>
      </>
    )
  }

  const backdropUrl = movie.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` 
    : '/backdrop_fallback.webp'
  const posterUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
    : '/poster_fallback.webp'
  const [backdropSrc, setBackdropSrc] = useState(backdropUrl)
  const [posterSrc, setPosterSrc] = useState(posterUrl)
  const productionCompany = movie.production_companies?.find(company => company.logo_path)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/movies/${movie.id}`
  const description = movie.overview || `Where to watch ${movie.title}.`
  const genres = movie.genres?.map(g => g.name) || []
  const ogPoster = movie.poster_path
  const ogSubtitle = movie.tagline || description
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: movie.title,
    subtitle: ogSubtitle,
    ...(ogPoster ? { poster: `https://image.tmdb.org/t/p/w500${ogPoster}` } : {})
  }).toString()}`
  // ISO 8601 duration: PT{h}H{m}M
  const isoDuration = movie.runtime
    ? `PT${Math.floor(movie.runtime / 60)}H${movie.runtime % 60}M`
    : undefined

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    description,
    image: posterUrl.startsWith('http') ? posterUrl : `${siteUrl}${posterUrl.startsWith('/') ? posterUrl : '/' + posterUrl}`,
    datePublished: movie.release_date || undefined,
    duration: isoDuration,
    genre: genres.length > 0 ? genres : undefined,
    director: director ? {
      '@type': 'Person',
      name: director.name,
      url: `${siteUrl}/person/${director.id}`
    } : undefined,
    actor: topCast.length > 0 ? topCast.slice(0, 5).map(person => ({
      '@type': 'Person',
      name: person.name,
      url: `${siteUrl}/person/${person.id}`
    })) : undefined,
    aggregateRating: movie.vote_count > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: movie.vote_average,
      ratingCount: movie.vote_count,
      bestRating: 10,
      worstRating: 0
    } : undefined
  }

  const videoObjectData = videoKey ? {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${movie.title} Trailer`,
    description: `Watch the official trailer for ${movie.title}`,
    thumbnailUrl: posterUrl.startsWith('http') ? posterUrl : `${siteUrl}${posterUrl.startsWith('/') ? posterUrl : '/' + posterUrl}`,
    uploadDate: movie.release_date || undefined,
    contentUrl: `https://www.youtube.com/watch?v=${videoKey}`,
    embedUrl: `https://www.youtube.com/embed/${videoKey}`
  } : null

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Movies', url: `${siteUrl}/movies` },
    { name: movie.title, url: canonicalUrl }
  ]

  return (
    <>
      <Head>
        <title>{`${movie.title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />

        <meta property='og:type' content='video.movie' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:title' content={`${movie.title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${movie.title} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
          }}
        />
        {videoObjectData && (
          <script
            type='application/ld+json'
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(videoObjectData).replace(/</g, '\\u003c')
            }}
          />
        )}
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box position='relative' minH='100vh' bg='#14181c' overflow='hidden'>
      <Box
        position='absolute'
        top={{ base: 'auto', md: 0 }}
        bottom={{ base: 0, md: 'auto' }}
        left={0}
        right={0}
        h={{ base: '400px', md: '500px' }}
        zIndex={0}
      >
        <Box
          position='relative'
          h='100%'
          w='100%'
          sx={{
            img: {
              objectFit: 'cover',
              objectPosition: { base: 'center bottom', md: 'center 20%' }
            }
          }}
        >
          <Image
            src={backdropSrc}
            alt={movie.title || 'Movie Backdrop'}
            fill
            priority
            sizes='100vw'
            onError={() => setBackdropSrc('/backdrop_fallback.webp')}
            unoptimized={backdropSrc.startsWith('/')}
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

      <Flex position='relative' zIndex={1} justify='center' align='flex-start' minH='100vh' pt={{ base: '4rem', md: '12rem' }} pb={{ base: '2rem', md: '4rem' }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }} justify='center' maxW='1200px' w='100%' px='1rem' gap={{ base: '1.5rem', md: '2.5rem' }}>
          
          <Flex align='center' direction='column' position={{ base: 'relative', md: 'sticky' }} top={{ md: '2rem' }} w='20rem' flexShrink={0} gap='1rem'>
            <Box position='relative' w={{ base: '20rem', md: '20rem' }} h={{ base: '30rem', md: '30rem' }}>
              <Image
                src={posterSrc}
                alt={movie.title || 'Movie Poster'}
                fill
                priority
                sizes='(max-width: 768px) 100vw, 320px'
                onError={() => setPosterSrc('/poster_fallback.webp')}
                style={{ objectFit: 'cover', borderRadius: '1rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)' }}
                unoptimized={posterSrc.startsWith('/')}
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
                  Directed by{' '}
                  <Link href={`/person/${director.id}`} passHref>
                    <Text
                      as='span'
                      color='white'
                      fontWeight='semibold'
                      _hover={{ textDecoration: 'underline' }}
                      cursor='pointer'
                    >
                      {director.name}
                    </Text>
                  </Link>
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

            <Flex
              direction={{ base: 'column', md: 'row' }}
              align={{ base: 'center', md: 'flex-end' }}
              justify={{ base: 'center', md: 'space-evenly' }}
              gap='2rem'
              w='100%'
              py={{ base: '1rem', md: 0 }}
            >
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
                <Wrap spacing={3} justify='center'>
                  {topCast.map((actor) => (
                    <WrapItem key={actor.id}>
                      <Link href={`/person/${actor.id}`} passHref>
                        <Flex
                          align='center'
                          bg='rgba(255, 255, 255, 0.1)'
                          px={3.5}
                          py={1.5}
                          borderRadius='full'
                          gap={2.5}
                          cursor='pointer'
                          transition='all 0.2s ease-in-out'
                          _hover={{
                            bg: 'rgba(255, 255, 255, 0.2)',
                            transform: 'translateY(-2px)'
                          }}
                        >
                          <ActorAvatar profilePath={actor.profile_path} name={actor.name} />
                          <Text fontSize='sm' color='white' fontWeight='medium' textShadow='0 0 4px black'>
                            {actor.name}
                          </Text>
                        </Flex>
                      </Link>
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
                {productionCompany ? (
                  <Link href={`/company/${productionCompany.id}`} passHref>
                    <Box
                      as='span'
                      cursor='pointer'
                      transition='all 0.2s ease-in-out'
                      _hover={{ transform: 'scale(1.05)', opacity: 0.9 }}
                    >
                      <ProductionLogo company={productionCompany} />
                    </Box>
                  </Link>
                ) : null}
              </Flex>
            </Flex>
          </Flex>

        </Flex>
      </Flex>
      </Box>
    </>
  )
}