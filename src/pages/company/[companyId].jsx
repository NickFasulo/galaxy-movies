import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  Box,
  Flex,
  Heading,
  Text,
  SimpleGrid,
  Badge,
  Link as ChakraLink
} from '@chakra-ui/react'
import { StarIcon, ExternalLinkIcon } from '@chakra-ui/icons'
import BackButton from '../../components/BackButton'
import dateFormatter from '../../utils/dateFormatter'

export const getServerSideProps = async (context) => {
  const { companyId } = context.query

  try {
    const [companyRes, moviesRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/company/${companyId}?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&with_companies=${companyId}&sort_by=popularity.desc&page=1`)
    ])

    if (!companyRes.ok) {
      if (companyRes.status === 404) return { notFound: true }
      return {
        props: {
          companyError: companyRes.status === 401
            ? 'Company data is unavailable because the configured TMDB API key was rejected.'
            : 'Company data is temporarily unavailable. Please try again later.'
        }
      }
    }

    const companyData = await companyRes.json()
    const moviesData = moviesRes.ok ? await moviesRes.json() : { results: [] }

    context.res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )

    return {
      props: {
        company: companyData,
        movies: moviesData.results || []
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        companyError: 'Company data is temporarily unavailable. Please try again later.'
      }
    }
  }
}

export default function Company({ company, movies, companyError }) {
  if (companyError) {
    return (
      <>
        <Head>
          <title>Company unavailable | Galaxy Movies</title>
          <meta name='description' content={companyError} />
        </Head>
        <Box minH='100vh' p={8} textAlign='center' bg='#14181c' color='white'>
          <Text mt={20}>{companyError}</Text>
          <Link href='/' passHref>
            <ChakraLink color='teal.300' mt={4} display='inline-block'>
              Return to Galaxy Movies
            </ChakraLink>
          </Link>
        </Box>
      </>
    )
  }

  const logoUrl = company.logo_path
    ? `https://image.tmdb.org/t/p/w500${company.logo_path}`
    : null
  const [logoSrc, setLogoSrc] = useState(logoUrl)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'
  const canonicalUrl = `${siteUrl}/company/${company.id}`
  const description = company.description || `Explore movies produced by ${company.name}.`

  return (
    <>
      <Head>
        <title>{`${company.name} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
        <meta property='og:type' content='website' />
        <meta property='og:title' content={`${company.name} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        {logoUrl && <meta property='og:image' content={logoUrl} />}
        <meta name='twitter:card' content='summary_large_image' />
      </Head>

      <Box position='relative' minH='100vh' bg='#14181c' color='white' py={{ base: 8, md: 12 }} px={{ base: 4, md: 12 }}>
        <Box maxW='1200px' mx='auto'>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'center', md: 'flex-start' }}
            gap={8}
            bg='rgba(255, 255, 255, 0.05)'
            p={{ base: 6, md: 8 }}
            borderRadius='2xl'
            border='1px solid'
            borderColor='whiteAlpha.200'
            backdropFilter='blur(10px)'
            mb={6}
            w='fit-content'
            maxW='100%'
            mx='auto'
          >
            {logoSrc ? (
              <Box
                position='relative'
                w='200px'
                h='120px'
                flexShrink={0}
                bg='white'
                p={4}
                borderRadius='xl'
                display='flex'
                alignItems='center'
                justifyContent='center'
              >
                <Image
                  src={logoSrc}
                  alt={`${company.name} logo`}
                  fill
                  sizes='200px'
                  onError={() => setLogoSrc(null)}
                  style={{ objectFit: 'contain', padding: '0.5rem' }}
                />
              </Box>
            ) : (
              <Flex
                w='200px'
                h='120px'
                flexShrink={0}
                bg='whiteAlpha.200'
                borderRadius='xl'
                align='center'
                justify='center'
                textAlign='center'
                p={4}
              >
                <Text fontWeight='bold' color='gray.300'>{company.name}</Text>
              </Flex>
            )}

            <Flex direction='column' gap={3} textAlign={{ base: 'center', md: 'left' }} flex={1}>
              <Heading size='xl'>{company.name}</Heading>

              <Flex direction='column' gap={2} align={{ base: 'center', md: 'flex-start' }}>
                <Flex gap={3} justify={{ base: 'center', md: 'flex-start' }} wrap='wrap' align='center'>
                  {company.origin_country && (
                    <Badge colorScheme='teal' fontSize='xs' px={2.5} py={1} borderRadius='md'>
                      {company.origin_country}
                    </Badge>
                  )}
                  {company.headquarters && (
                    <Text fontSize='sm' color='gray.400'>
                      📍 {company.headquarters}
                    </Text>
                  )}
                </Flex>

                {company.homepage && (
                  <ChakraLink
                    href={company.homepage}
                    isExternal
                    fontSize='sm'
                    color='teal.300'
                    display='inline-flex'
                    alignItems='center'
                    gap={1}
                    _hover={{ textDecoration: 'underline' }}
                  >
                    Official Website <ExternalLinkIcon mx='2px' />
                  </ChakraLink>
                )}
              </Flex>

              {company.description && (
                <Text color='gray.300' fontSize='md' mt={2}>
                  {company.description}
                </Text>
              )}
            </Flex>
          </Flex>

          <Flex justify='center' mb={10}>
            <BackButton />
          </Flex>

          <Flex justify='center' mb={6}>
            <Heading size='lg'>
              Popular Releases
            </Heading>
          </Flex>

          {movies.length === 0 ? (
            <Text color='gray.400'>No movies found for this production company.</Text>
          ) : (
            <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing={{ base: 4, md: 6 }}>
              {movies.map((movie) => {
                const posterPath = movie.poster_path
                  ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                  : '/galaxy-movies-background.png'

                return (
                  <Link key={movie.id} href={`/movies/${movie.id}`} passHref>
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
                    >
                      <Box position='relative' w='100%' pt='150%'>
                        <Image
                          src={posterPath}
                          alt={movie.title || 'Movie Poster'}
                          fill
                          sizes='(max-width: 768px) 50vw, 20vw'
                          style={{ objectFit: 'cover' }}
                        />
                      </Box>
                      <Box p={3}>
                        <Text fontWeight='bold' fontSize='sm' noOfLines={1} color='white'>
                          {movie.title}
                        </Text>
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
              })}
            </SimpleGrid>
          )}
        </Box>
      </Box>
    </>
  )
}