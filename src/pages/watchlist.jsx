import Head from 'next/head'
import Link from 'next/link'
import { Badge, Box, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { useQuery } from 'react-query'
import MovieCard from '../components/MovieCard'
import ServicesPicker from '../components/ServicesPicker'
import WaitlistForm from '../components/WaitlistForm'
import BackButton from '../components/BackButton'
import { useUserData } from '../hooks/useUserData'
import { getProviderId } from '../utils/tmdb'

export default function Watchlist() {
  const data = useUserData()
  const { watchlist, services } = data
  const ids = watchlist.map((item) => item.id)

  const myProviderIds = new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter(Boolean)
  )

  const { data: providerData } = useQuery(
    ['watchProviders', services.region, ids.join(',')],
    async () => {
      const resp = await fetch(`/api/watchProviders?region=${services.region}&ids=${ids.join(',')}`)
      if (!resp.ok) throw new Error('Provider lookup failed')
      return resp.json()
    },
    { enabled: ids.length > 0 && myProviderIds.size > 0, staleTime: 1000 * 60 * 60 }
  )

  const streamingIds = new Set(
    Object.entries(providerData?.results || {})
      .filter(([, providerIds]) => providerIds.some((id) => myProviderIds.has(id)))
      .map(([id]) => Number(id))
  )

  const nowStreamingBadge = (
    <Badge colorScheme='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
      Now streaming
    </Badge>
  )

  return (
    <>
      <Head>
        <title>My List | Galaxy Movies</title>
        <meta name='robots' content='noindex' />
      </Head>
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>My List</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>
            Movies you've saved. Your list lives on this device — no account needed.
          </Text>

          <Box mt={6}>
            <ServicesPicker />
          </Box>

          {watchlist.length === 0 ? (
            <Text mt={10} color='gray.400' textAlign='center'>
              Nothing saved yet.{' '}
              <Link href='/' style={{ textDecoration: 'underline' }}>
                Find something to watch
              </Link>{' '}
              and hit the bookmark to save it here.
            </Text>
          ) : (
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={6} mt={8}>
              {watchlist.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  badge={streamingIds.has(movie.id) ? nowStreamingBadge : null}
                />
              ))}
            </SimpleGrid>
          )}

          <Box mt={10} maxW='36rem'>
            <WaitlistForm />
          </Box>

          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
