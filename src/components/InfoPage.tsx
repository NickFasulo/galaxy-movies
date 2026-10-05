import type { ReactNode } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Box, Heading, Text } from '@chakra-ui/react'
import HreflangTags from './HreflangTags'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'

export default function InfoPage({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
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
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
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
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={12}>
        <Box maxW='48rem' mx='auto' px={6}>
          <Heading as='h1' mb={6} textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          {children}
        </Box>
      </Box>
    </>
  )
}

export function InfoParagraph({ children }: { children?: ReactNode }) {
  return <Text mb={4}>{children}</Text>
}
