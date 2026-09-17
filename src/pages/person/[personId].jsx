import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import {
  Flex,
  Box,
  Heading,
  Text,
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
          error: 'Person information is temporarily unavailable.'
        }
      }
    }

    const person = await res.json()

    const crewMovies = person.movie_credits?.crew || []
    const directedList = crewMovies.filter((m) => m.job === 'Director')
    const uniqueDirected = Array.from(
      new Map(directedList.map((m) => [m.id, m])).values()
    ).sort((a, b) => b.popularity - a.popularity)

    const castList = person.movie_credits?.cast || []
    const uniqueActing = Array.from(
      new Map(castList.map((m) => [m.id, m])).values()
    ).sort((a, b) => b.popularity - a.popularity)

    context.res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )

    return {
      props: {
        person,
        directedMovies: uniqueDirected,
        actingMovies: uniqueActing
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        error: 'Person information is temporarily unavailable.'
      }
    }
  }
}

export default function PersonDetails({ person, directedMovies, actingMovies, error }) {
  const headerRef = useRef(null)
  const sidebarRef = useRef(null)
  const [containerHeight, setContainerHeight] = useState(undefined)

  useEffect(() => {
    if (!headerRef.current || !sidebarRef.current) return

    const updateHeight = () => {
      if (headerRef.current && sidebarRef.current) {
        const hHeader = headerRef.current.offsetHeight
        const hSidebar = sidebarRef.current.offsetHeight
        setContainerHeight(hHeader + hSidebar)
      }
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(headerRef.current)
    observer.observe(sidebarRef.current)

    return () => observer.disconnect()
  }, [person])

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
  const totalCredits = (directedMovies?.length || 0) + (actingMovies?.length || 0)

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
    jobTitle: person.known_for_department || 'Film Professional'
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
            <Box
              w={{ base: '100%', md: '20rem' }}
              h={{ base: 'auto', md: containerHeight ? `${containerHeight}px` : 'auto' }}
              flexShrink={0}
            >
              <Flex
                ref={sidebarRef}
                direction='column'
                align='center'
                position={{ base: 'relative', md: 'sticky' }}
                top={{ md: '2rem' }}
                w='100%'
                maxW='20rem'
                mx='auto'
                gap='1.25rem'
              >
                <Box position='relative' w='100%' maxW='20rem' h='30rem'>
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
                  maxW='20rem'
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
                      <Text color='white'>{totalCredits} movies</Text>
                    </Box>
                  </Flex>
                </Box>

                <BackButton />
              </Flex>
            </Box>

            <Flex direction='column' flex={1} w='100%' gap='1.5rem'>
              <Box ref={headerRef} display='flex' flexDirection='column' gap='1.5rem'>
                <Box>
                  <Heading size='2xl' color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                    {person.name}
                  </Heading>
                </Box>

                {person.biography && (
                  <Box>
                    <Heading as='h2' size='sm' color='gray.400' textTransform='uppercase' mb={2} textAlign={{ base: 'center', md: 'left' }}>
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
              </Box>

              {directedMovies?.length > 0 && (
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
                    Directed Movies ({directedMovies.length})
                  </Text>

                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} spacing={4}>
                    {directedMovies.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} showRole={false} />
                    ))}
                  </SimpleGrid>
                </Box>
              )}

              {actingMovies?.length > 0 && (
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
                    Acting Credits ({actingMovies.length})
                  </Text>

                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} spacing={4}>
                    {actingMovies.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} showRole={true} />
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

function MovieCard({ movie, showRole }) {
  const [imgSrc, setImgSrc] = useState(
    movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : '/galaxy-movies-background.png'
  )

  return (
    <Link href={`/movies/${movie.id}`} passHref>
      <Box
        bg='rgba(255, 255, 255, 0.05)'
        borderRadius='xl'
        overflow='hidden'
        cursor='pointer'
        transition='all 0.2s ease-in-out'
        _hover={{
          transform: 'translateY(-6px)',
          boxShadow: '0 12px 24px -10px rgba(0,0,0,0.8)',
          bg: 'rgba(255, 255, 255, 0.1)'
        }}
        h='100%'
        display='flex'
        flexDirection='column'
      >
        <Box position='relative' w='100%' pt='150%'>
          <Image
            src={imgSrc}
            alt={movie.title || 'Movie Poster'}
            fill
            sizes='(max-width: 768px) 50vw, 20vw'
            onError={() => setImgSrc('/galaxy-movies-background.png')}
            style={{ objectFit: 'cover' }}
          />
        </Box>

        <Box p={3} display='flex' flexDirection='column' justifyContent='space-between' flex={1}>
          <Box>
            <Text fontWeight='bold' fontSize='sm' noOfLines={1} color='white'>
              {movie.title}
            </Text>
            {showRole && movie.character && (
              <Text color='gray.400' fontSize='xs' noOfLines={1} mt={0.5}>
                as {movie.character}
              </Text>
            )}
          </Box>

          <Flex justify='space-between' align='center' mt={2}>
            <Text fontSize='xs' color='gray.400'>
              {dateFormatter(movie.release_date)?.slice(-4) || 'N/A'}
            </Text>
            <Flex align='center' gap={1}>
              <StarIcon boxSize={3} color='gold' />
              <Text fontSize='xs' fontWeight='semibold' color='white'>
                {movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : 'NR'}
              </Text>
            </Flex>
          </Flex>
        </Box>
      </Box>
    </Link>
  )
}