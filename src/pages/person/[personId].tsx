import type { GetServerSideProps } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Flex, Box, Heading, Text, SimpleGrid, Icon } from '@chakra-ui/react';
import BackButton from '../../components/BackButton'
import DetailErrorView from '../../components/DetailErrorView'
import { BottomBackdrop } from '../../components/Backdrop'
import PageHead from '../../components/PageHead'
import dateFormatter from '../../utils/dateFormatter'
import { normalizeTvTitle } from '../../utils/tmdb'
import { MIN_INDEXABLE_MOVIES } from '../../utils/contentOpportunities'
import { setSwrCache } from '../../utils/ssr'
import { absoluteImageUrl } from '../../utils/schema'
import { tmdbImage, SITE_URL } from '../../utils/site'
import type { MovieCredit, NormalizedTvShow, TmdbPerson } from '../../types/tmdb'
import { LuStar } from 'react-icons/lu';

type PersonTvShow = NormalizedTvShow & { character: string }

type Props =
  | { error: string }
  | { person: TmdbPerson; directedMovies: MovieCredit[]; actingMovies: MovieCredit[]; tvShows: PersonTvShow[] }

type CardTitle = (MovieCredit | PersonTvShow) & { mediaType?: 'tv' }

// Props are serialized into the page-data payload — keep only the fields the
// cards render so prolific filmographies stay under the 128 kB page-data limit.
const toCardCredit = (m: MovieCredit): MovieCredit => ({
  id: m.id,
  title: m.title,
  poster_path: m.poster_path,
  release_date: m.release_date,
  vote_average: m.vote_average,
  character: m.character
})

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { personId } = context.query

  if (!/^\d{1,10}$/.test(String(personId))) return { notFound: true }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${personId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=movie_credits,tv_credits`
    )

    if (!res.ok) {
      if (res.status === 404) return { notFound: true }
      return {
        props: {
          error: 'Person information is temporarily unavailable.'
        }
      }
    }

    const person: TmdbPerson = await res.json()

    const crewMovies = person.movie_credits?.crew || []
    const directedList = crewMovies.filter((m) => m.job === 'Director')
    const uniqueDirected = Array.from(
      new Map(directedList.map((m) => [m.id, m])).values()
    ).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))

    const castList = person.movie_credits?.cast || []
    const uniqueActing = Array.from(
      new Map(castList.map((m) => [m.id, m])).values()
    ).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))

    // tv_credits include one entry per episode — dedupe and cap so prolific
    // guest stars don't produce hundreds of cards.
    const tvCreditList = [
      ...(person.tv_credits?.cast || []),
      ...(person.tv_credits?.crew || [])
    ]
    const uniqueTvShows: PersonTvShow[] = Array.from(
      new Map(tvCreditList.map((m) => [m.id, m])).values()
    )
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 24)
      .map((c) => {
        const show = normalizeTvTitle(c)
        return {
          id: show.id,
          name: show.name,
          title: show.title,
          poster_path: show.poster_path,
          release_date: show.release_date,
          vote_average: show.vote_average,
          mediaType: show.mediaType,
          character: c.character || c.roles?.[0]?.character || c.job || c.jobs?.[0]?.job || ''
        }
      })

    if (context.res) setSwrCache(context.res)

    // The raw append_to_response credits live only in these lists — re-sending
    // them inside `person` would double the payload.
    const personSummary: TmdbPerson = {
      id: person.id,
      name: person.name,
      biography: person.biography,
      birthday: person.birthday,
      deathday: person.deathday,
      place_of_birth: person.place_of_birth,
      profile_path: person.profile_path,
      known_for_department: person.known_for_department
    }

    return {
      props: {
        person: personSummary,
        directedMovies: uniqueDirected.map(toCardCredit),
        actingMovies: uniqueActing.map(toCardCredit),
        tvShows: uniqueTvShows
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

export default function PersonDetails(props: Props) {
  if ('error' in props) {
    return <DetailErrorView title='Person unavailable' message={props.error} />
  }

  return (
    <PersonContent
      person={props.person}
      directedMovies={props.directedMovies}
      actingMovies={props.actingMovies}
      tvShows={props.tvShows}
    />
  )
}

function SectionTitle({ children }: { children?: ReactNode }) {
  return (
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
      _before={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
      _after={{ content: '""', flex: 1, borderTop: '1px solid var(--chakra-colors-white-alpha-400)' }}
    >
      {children}
    </Text>
  )
}

function PersonContent({ person, directedMovies, actingMovies, tvShows }: { person: TmdbPerson; directedMovies: MovieCredit[]; actingMovies: MovieCredit[]; tvShows: PersonTvShow[] }) {
  const profilePath = tmdbImage(person.profile_path) || '/profile_fallback.webp'
  const [profileSrc, setProfileSrc] = useState(profilePath)
  const canonicalUrl = `${SITE_URL}/person/${person.id}`
  const description = person.biography
    ? `${person.biography.slice(0, 155).trim()}...`
    : `Explore filmography, biography, and movie details for ${person.name} on Galaxy Movies.`
  const ogSubtitle = person.known_for_department
    ? `${person.known_for_department} · Galaxy Movies`
    : description

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
  const totalCredits = (directedMovies?.length || 0) + (actingMovies?.length || 0) + (tvShows?.length || 0)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: person.name,
    description,
    image: absoluteImageUrl(profileSrc, SITE_URL),
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
      <PageHead
        title={person.name}
        description={description}
        canonicalUrl={canonicalUrl}
        ogType='profile'
        ogSubtitle={ogSubtitle}
        // A person with no bio and a small filmography is just a name and a
        // few posters — keep it out of the index until TMDB fills it out.
        noindex={!person.biography && totalCredits < MIN_INDEXABLE_MOVIES}
        posterPath={person.profile_path}
        structuredData={structuredData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: person.name, url: canonicalUrl }
        ]}
      />

      <Box position='relative' minH='100vh' bg='transparent' color='white' py={{ base: '2rem', md: '4rem' }} pt={{ base: '5em', md: '6rem' }} px='1rem'>
        <BottomBackdrop />
        <Flex justify='center' position='relative' zIndex={1}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'center', md: 'flex-start' }}
            maxW='1200px'
            w='100%'
            gap={{ base: '2rem', md: '3rem' }}
          >
            <Box
              w={{ base: '100%', md: '20rem' }}
              flexShrink={0}
            >
              <Flex
                direction='column'
                align='center'
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
                    onError={() => setProfileSrc('/profile_fallback.webp')}
                    style={{
                      objectFit: 'cover',
                      borderRadius: '0.5rem',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)'
                    }}
                    unoptimized={profileSrc.startsWith('/')}
                  />
                </Box>

                <Box
                  w='100%'
                  maxW='20rem'
                  p={4}
                  bg='blackAlpha.500'
                  borderRadius='lg'
                  border='1px solid var(--chakra-colors-border-subtle)'
                  backdropFilter='blur(10px)'
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
                      <Text color='white'>{totalCredits} credits</Text>
                    </Box>
                  </Flex>
                </Box>

                <Flex justify='center' gap={10}>
                  <BackButton />
                </Flex>
              </Flex>
            </Box>

            <Flex direction='column' flex={1} w='100%' gap='1.5rem'>
              <Box display='flex' flexDirection='column' gap='1.5rem'>
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
                  <SectionTitle>Directed Movies ({directedMovies.length})</SectionTitle>
                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} gap={4}>
                    {directedMovies.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} showRole={false} />
                    ))}
                  </SimpleGrid>
                </Box>
              )}

              {actingMovies?.length > 0 && (
                <Box mt={2}>
                  <SectionTitle>Acting Credits ({actingMovies.length})</SectionTitle>
                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} gap={4}>
                    {actingMovies.map((movie) => (
                      <MovieCard key={movie.id} movie={movie} showRole={true} />
                    ))}
                  </SimpleGrid>
                </Box>
              )}

              {tvShows?.length > 0 && (
                <Box mt={2}>
                  <SectionTitle>TV Shows ({tvShows.length})</SectionTitle>
                  <SimpleGrid columns={{ base: 2, sm: 3, lg: 4 }} gap={4}>
                    {tvShows.map((show) => (
                      <MovieCard key={show.id} movie={show} showRole={true} />
                    ))}
                  </SimpleGrid>
                </Box>
              )}
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </>
  );
}

function MovieCard({ movie, showRole }: { movie: CardTitle; showRole: boolean }) {
  const posterPath = tmdbImage(movie.poster_path) || '/poster_fallback.webp'
  const [imgSrc, setImgSrc] = useState(posterPath)

  return (
    <Link href={movie.mediaType === 'tv' ? `/tv/${movie.id}` : `/movies/${movie.id}`} passHref>
      <Box
        bg='rgba(255, 255, 255, 0.05)'
        borderRadius='0.5rem'
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
            onError={() => setImgSrc('/poster_fallback.webp')}
            style={{ objectFit: 'cover' }}
            unoptimized={imgSrc.startsWith('/')}
          />
        </Box>

        <Box p={3} display='flex' flexDirection='column' justifyContent='space-between' flex={1}>
          <Box>
            <Text fontWeight='bold' fontSize='sm' lineClamp={1} color='white'>
              {movie.title}
            </Text>
            {showRole && movie.character && (
              <Text color='gray.400' fontSize='xs' lineClamp={1} mt={0.5}>
                as {movie.character}
              </Text>
            )}
          </Box>

          <Flex justify='space-between' align='center' mt={2}>
            <Text fontSize='xs' color='gray.400'>
              {movie.release_date ? dateFormatter(movie.release_date).slice(-4) : 'N/A'}
            </Text>
            <Flex align='center' gap={1}>
              <Icon boxSize={3} color='gold' asChild><LuStar fill='currentColor' /></Icon>
              <Text fontSize='xs' fontWeight='semibold' color='white'>
                {movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : 'NR'}
              </Text>
            </Flex>
          </Flex>
        </Box>
      </Box>
    </Link>
  );
}
