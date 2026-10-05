import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import ServicesPicker from '../components/ServicesPicker'
import WaitlistForm from '../components/WaitlistForm'
import BackButton from '../components/BackButton'
import { useUserData } from '../hooks/useUserData'

export default function Watchlist() {
  const { watchlist } = useUserData()

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
            Movies you&apos;ve saved. Your list lives on this device — no account needed.
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
            <MovieGrid movies={watchlist} />
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
