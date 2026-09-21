import Head from 'next/head'
import { useRouter } from 'next/router'
import { Box, Heading, Text } from '@chakra-ui/react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'

export default function InfoPage({ title, description, children }) {
  const { asPath } = useRouter()
  const canonicalUrl = `${siteUrl}${asPath.split('?')[0]}`

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
      </Head>
      <Box maxW='48rem' mx='auto' px={6} py={12}>
        <Heading as='h1' mt={8} mb={6}>{title}</Heading>
        {children}
      </Box>
    </>
  )
}

export function InfoParagraph({ children }) {
  return <Text mb={4}>{children}</Text>
}
