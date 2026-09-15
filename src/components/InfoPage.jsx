import Head from 'next/head'
import Link from 'next/link'
import { Box, Heading, Text } from '@chakra-ui/react'

export default function InfoPage({ title, description, children }) {
  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
      </Head>
      <Box maxW='48rem' mx='auto' px={6} py={12}>
        <Link href='/'>← Galaxy Movies</Link>
        <Heading as='h1' mt={8} mb={6}>{title}</Heading>
        {children}
      </Box>
    </>
  )
}

export function InfoParagraph({ children }) {
  return <Text mb={4}>{children}</Text>
}
