import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text, Flex, Button } from '@chakra-ui/react'
import BackButton from '../components/BackButton'

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page Not Found | Galaxy Movies</title>
        <meta name='description' content="The page you're looking for doesn't exist or may have moved." />
        <meta name='robots' content='noindex, follow' />
      </Head>
      <Box maxW='48rem' mx='auto' px={6} py={12} textAlign='center'>
        <Heading as='h1' mt={8} mb={4}>Page Not Found</Heading>
        <Text mb={8} color='gray.600'>
          We couldn&apos;t find the page you were looking for. It may have been moved, or the link might be incorrect.
        </Text>
        <Flex wrap='wrap' gap={4} justify='center' align='center'>
          <Link href='/'>
            <Button as='span' colorScheme='blue'>Go Home</Button>
          </Link>
          <Link href='/browse/popular'>
            <Button as='span'>Browse Movies</Button>
          </Link>
          <Link href='/streaming'>
            <Button as='span'>Streaming Guide</Button>
          </Link>
          <BackButton />
        </Flex>
      </Box>
    </>
  )
}
