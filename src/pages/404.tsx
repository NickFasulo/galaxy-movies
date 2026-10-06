import Link from 'next/link'
import { Heading, Text, Flex, Button } from '@chakra-ui/react'
import BackButton from '../components/BackButton'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'

export default function NotFoundPage() {
  return (
    <>
      <PageHead
        title='Page Not Found'
        description="The page you're looking for doesn't exist or may have moved."
        noindex
      />
      <PageShell maxW='48rem' pb={12}>
        <Flex direction='column' align='center' textAlign='center'>
          <Heading as='h1' mb={4}>Page Not Found</Heading>
          <Text mb={8} color='gray.400'>
            We couldn&apos;t find the page you were looking for. It may have been moved, or the link might be incorrect.
          </Text>
          <Flex wrap='wrap' gap={4} justify='center' align='center'>
            <Link href='/'>
              <Button as='span' bg='#1f252b' color='white' border='1px solid var(--chakra-colors-white-alpha-300)' _hover={{ bg: '#2a3138' }}>Go Home</Button>
            </Link>
            <Link href='/browse/popular'>
              <Button as='span' bg='#1f252b' color='white' border='1px solid var(--chakra-colors-white-alpha-300)' _hover={{ bg: '#2a3138' }}>Browse Movies</Button>
            </Link>
            <Link href='/streaming'>
              <Button as='span' bg='#1f252b' color='white' border='1px solid var(--chakra-colors-white-alpha-300)' _hover={{ bg: '#2a3138' }}>Streaming Guide</Button>
            </Link>
            <BackButton />
          </Flex>
        </Flex>
      </PageShell>
    </>
  )
}
