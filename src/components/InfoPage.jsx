import Head from 'next/head'
import { useRouter } from 'next/router'
import { Box, Heading, Text } from '@chakra-ui/react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'

export default function InfoPage({ title, description, children }) {
  const { asPath } = useRouter()
  const canonicalUrl = `${siteUrl}${asPath.split('?')[0]}`
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title,
    subtitle: description
  }).toString()}`

  return (
    <>
      <Head>
        <title>{`${title} | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:title' content={`${title} | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${title} | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />
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
