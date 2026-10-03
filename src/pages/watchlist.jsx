import Head from 'next/head'
import Link from 'next/link'
import { Badge, Box, Heading, Text } from '@chakra-ui/react'
import { useQuery } from 'react-query'
import MovieGrid from '../components/MovieGrid'
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

  const getBadge = (movie) => streamingIds.has(movie.id) ? (
    <Badge colorScheme='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
      Now streaming
    </Badge>
  ) : null

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

          {watchlist.length === 0 ? (
            <Text mt={10} color='gray.400' textAlign='center'>
              Nothing saved yet.{' '}
              <Link href='/' style={{ textDecoration: 'underline' }}>
                Find something to watch
              </Link>{' '}
              and hit the bookmark to save it here.
            </Text>
          ) : (
            <MovieGrid movies={watchlist} getBadge={getBadge} />
          )}

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            My Streaming Services
          </Heading>
          <ServicesPicker />

          <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>
            Streaming Alerts
          </Heading>
          <Box maxW='36rem'>
            <WaitlistForm />
          </Box>

          <Text textAlign='center' mt={8} color='gray.400'>
            Availability changes by region and over time. Check each movie page for current provider information.
          </Text>
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
