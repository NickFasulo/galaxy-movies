import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import {
  Flex,
  Box,
  Heading,
  Text,
  Badge,
  SimpleGrid
} from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'
import BackButton from '../../components/BackButton'
import dateFormatter from '../../utils/dateFormatter'

export const getServerSideProps = async (context) => {
  const { personId } = context.query

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${personId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=movie_credits`
    )

    if (!res.ok) {
      if (res.status === 404) return { notFound: true }
      return {
        props: {
          error: 'Actor information is temporarily unavailable.'
        }
      }
    }

    const person = await res.json()

    const castMovies = person.movie_credits?.cast || []
    const uniqueMovies = Array.from(
      new Map(castMovies.map((m) => [m.id, m])).values()
    )

    const sortedMovies = uniqueMovies.sort((a, b) => b.popularity - a.popularity)

    context.res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )

    return {
      props: {
        person,
        movies: sortedMovies
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        error: 'Actor information is temporarily unavailable.'
      }
    }
  }
}

export default function ActorDetails({ person, movies, error }) {
  if (error) {
    return (
      <Box minH='100vh' bg='#14181c' p={8} textAlign='center' color='white'>
        <Text mt={20}>{error}</Text>
        <Link href='/'>Return to Galaxy Movies</Link>
      </Box>
    )
  }

  const profileUrl = person.profile_path
    ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
    : '/galaxy-movies-background.png'

  const [profileSrc, setProfileSrc] = useState(profileUrl)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'
  const canonicalUrl = `${siteUrl}/person/${person.id}`
  const description = person.biography
    ? `${person.biography.slice(0, 155).trim()}...`
    : `Explore filmography, biography, and movie details for ${person.name} on Galaxy Movies.`

  const getAge = () => {
    if (!person.birthday) return null
    const birth = new Date(person.birthday)
    const end = person.deathday ? new Date(person.deathday) : new Date()
    let age = end.getFullYear() - birth.getFullYear()
    const monthDiff = end.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const age = getAge()

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: person.name,
    description,
    image: profileSrc.startsWith('http') ? profileSrc : `${siteUrl}${profileSrc}`,
    birthDate: person.birthday || undefined,
    deathDate: person.deathday || undefined,
    birthPlace: person.place_of_birth ? {
      '@type': 'Place',
      name: person.place_of_birth
    } : undefined,
    jobTitle: person.known_for_department || 'Actor'
  }

  return (
    <>
      <Head>
        <title>{`${person.name} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />

        <meta property='og:type' content='profile' />
        <meta property='og:title' content={`${person.name} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={profileSrc} />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${person.name} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={profileSrc} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
          }}
        />
      </Head>

      <Box position='relative' minH='100vh' bg='#14181c' color='white' py={{ base: '2rem', md: '4rem' }} px='1rem'>
        <Flex justify='center'>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'center', md: 'flex-start' }}
            maxW='1200px'
            w='100%'
            gap={{ base: '2rem', md: '3rem' }}
          >
            <Flex
              direction='column'
              align='center'
              position={{ base: 'relative', md: 'sticky' }}
              top={{ md: '2rem' }}
              w={{ base: '100%', maxW: '20rem' }}
              flexShrink={0}
              gap='1.25rem'
            >
              <Box position='relative' w='20rem' h='30rem'>
                <Image
                  src={profileSrc}
                  alt={person.name}
                  fill
                  priority
                  sizes='(max-width: 768px) 100vw, 320px'
                  onError={() => setProfileSrc('/galaxy-movies-background.png')}
                  style={{
                    objectFit: 'cover',
                    borderRadius: '1rem',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)'
                  }}
                />
              </Box>

              <Box
                w='100%'
                p={4}
                bg='blackAlpha.600'
                borderRadius='1rem'
                border='1px solid'
                borderColor='whiteAlpha.200'
              >
                <Heading as='h3' fontSize='sm' textTransform='uppercase' color='gray.400' mb={3}>
                  Personal Info
                </Heading>

                <Flex direction='column' gap={2.5} fontSize='xs'>
                  {person.known_for_department && (
                    <Box>
                      <Text color='gray.400' fontWeight='bold'>Known For</Text>
                      <Text color='white'>{person.known_for_department}</Text>
                    </Box>
                  )}

                  {person.birthday && (
                    <Box>
                      <Text color='gray.400' fontWeight='bold'>Born</Text>
                      <Text color='white'>
                        {dateFormatter(person.birthday)} {age ? `(age ${age}${person.deathday ? ', died' : ''})` : ''}
                      </Text>
                    </Box>
                  )}

                  {person.place_of_birth && (
                    <Box>
                      <Text color='gray.400' fontWeight='bold'>Place of Birth</Text>
                      <Text color='white'>{person.place_of_birth}</Text>
                    </Box>
                  )}

                  <Box>
                    <Text color='gray.400' fontWeight='bold'>Known Credits</Text>
                    <Text color='white'>{movies.length} movies</Text>
                  </Box>
                </Flex>
              </Box>

              <BackButton />
            </Flex>

            <Flex direction='column' flex={1} w='100%' gap='1.5rem'>
              <Box>
                <Heading size='2xl' color='white' textShadow='0 0 4px black' textAlign='center'>
                  {person.name}
                </Heading>
              </Box>

              {person.biography && (
                <Box>
                  <Heading as='h2' size='sm' color='gray.400' textTransform='uppercase' mb={2}>
                    Biography
                  </Heading>
                  <Text
                    color='gray.200'
                    fontSize='sm'
                    lineHeight='relaxed'
                    whiteSpace='pre-line'
                    textShadow='0 0 4px black'
                  >
                    {person.biography}
                  </Text>
                </Box>
              )}

              {movies.length > 0 && (
                <Box mt={2}>
                  <Text
                    color='gray.400'
                    fontSize='xs'
                    fontWeight='bold'
                    textTransform='uppercase'
                    textShadow='0 0 4px black'
                    display='flex'
                    alignItems='center'
                    gap={3}
                    mb={4}
                    _before={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                    _after={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                  >
                    Known For ({movies.length})
                  </Text>

                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} spacing={4}>
                    {movies.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} />
                    ))}
                  </SimpleGrid>
                </Box>
              )}
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </>
  )
}

function MovieCard({ movie }) {
  const [imgSrc, setImgSrc] = useState(
    movie.poster_path
      ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
      : '/galaxy-movies-background.png'
  )

  const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : 'N/A'

  return (
    <Link href={`/movies/${movie.id}`} passHref>
      <Box
        bg='rgba(255, 255, 255, 0.05)'
        borderRadius='0.75rem'
        overflow='hidden'
        border='1px solid'
        borderColor='whiteAlpha.200'
        transition='all 0.2s ease-in-out'
        _hover={{
          transform: 'translateY(-4px)',
          borderColor: 'whiteAlpha.500',
          bg: 'rgba(255, 255, 255, 0.1)'
        }}
        cursor='pointer'
        h='100%'
        display='flex'
        flexDirection='column'
      >
        <Box position='relative' w='100%' pt='150%'>
          <Image
            src={imgSrc}
            alt={movie.title || 'Movie Poster'}
            fill
            sizes='(max-width: 768px) 50vw, 200px'
            onError={() => setImgSrc('/galaxy-movies-background.png')}
            style={{ objectFit: 'cover' }}
          />
          {movie.vote_average > 0 && (
            <Badge
              position='absolute'
              top={2}
              right={2}
              bg='blackAlpha.800'
              color='gold'
              px={1.5}
              py={0.5}
              borderRadius='md'
              fontSize='xs'
              display='flex'
              alignItems='center'
              gap={1}
            >
              <StarIcon boxSize={2.5} />
              {Math.round(movie.vote_average * 10) / 10}
            </Badge>
          )}
        </Box>

        <Flex direction='column' p={2.5} flex={1} justify='space-between'>
          <Box>
            <Text color='white' fontWeight='bold' fontSize='xs' noOfLines={1}>
              {movie.title}
            </Text>
            {movie.character && (
              <Text color='gray.400' fontSize='10px' noOfLines={1} mt={0.5}>
                as {movie.character}
              </Text>
            )}
          </Box>

          <Text color='gray.500' fontSize='10px' mt={2}>
            {releaseYear}
          </Text>
        </Flex>
      </Box>
    </Link>
  )
}