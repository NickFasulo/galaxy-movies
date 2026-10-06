import Link from 'next/link'
import { Box, Text } from '@chakra-ui/react'
import MovieGrid from '../components/MovieGrid'
import ServicesPicker from '../components/ServicesPicker'
import WaitlistForm from '../components/WaitlistForm'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { useUserData } from '../hooks/useUserData'

export default function Watchlist() {
  const { watchlist } = useUserData()

  return (
    <>
      <PageHead
        title='My List'
        description='Movies you have saved. Your list lives on this device — no account needed.'
        noindex
      />
      <PageShell
        title='My List'
        description="Movies you've saved. Your list lives on this device — no account needed."
        withBackButton
      >
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
      </PageShell>
    </>
  )
}
