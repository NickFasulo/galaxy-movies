import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'

export default function Disclosure() {
  return (
    <>
      <Head>
        <title>Affiliate Disclosure | Galaxy Movies</title>
        <meta
          name='description'
          content='Learn how Galaxy Movies may earn commission from qualifying links.'
        />
      </Head>
      <Box maxW='48rem' mx='auto' px={6} py={12}>
        <Heading as='h1' mb={6}>Affiliate Disclosure</Heading>
        <Text mb={4}>
          Galaxy Movies may use affiliate links to streaming, rental, purchase,
          or ticketing services. If you follow one of those links and complete
          a qualifying purchase or subscription, we may earn a commission at no
          additional cost to you.
        </Text>
        <Text mb={6}>
          Provider availability and pricing can change. We do not accept
          payment for editorial ratings or movie information.
        </Text>
        <Link href='/'>Back to Galaxy Movies</Link>
      </Box>
    </>
  )
}
