import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  Box,
  Flex,
  Heading,
  Text,
  Badge,
  Link as ChakraLink
} from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import BackButton from '../../components/BackButton'
import MovieGrid from '../../components/MovieGrid'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import { normalizeTvTitle } from '../../utils/tmdb'

export const getServerSideProps = async (context) => {
  const { networkId } = context.query

  try {
    const [networkRes, showsRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/network/${networkId}?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${process.env.TMDB_API_KEY}&with_networks=${networkId}&sort_by=vote_count.desc&vote_count.gte=100&page=1`)
    ])

    if (!networkRes.ok) {
      if (networkRes.status === 404) return { notFound: true }
      return {
        props: {
          networkError: 'Network data is temporarily unavailable. Please try again later.'
        }
      }
    }

    const networkData = await networkRes.json()
    const showsData = showsRes.ok ? await showsRes.json() : { results: [] }

    if (context.res) {
      context.res.setHeader(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=86400'
      )
    }

    return {
      props: {
        network: networkData,
        shows: (showsData.results || []).filter((s) => s.poster_path).map(normalizeTvTitle)
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        networkError: 'Network data is temporarily unavailable. Please try again later.'
      }
    }
  }
}

export default function Network({ network, shows, networkError }) {
  if (networkError) {
    return (
      <>
        <Head>
          <title>Network unavailable | Galaxy Movies</title>
          <meta name='description' content={networkError} />
        </Head>
        <Box minH='100vh' p={8} textAlign='center' bg='transparent' color='white'>
          <Text mt={20}>{networkError}</Text>
          <Link href='/' passHref>
            <ChakraLink color='teal.300' mt={4} display='inline-block'>
              Return to Galaxy Movies
            </ChakraLink>
          </Link>
        </Box>
      </>
    )
  }

  const logoPath = network.logo_path
  const logoUrl = logoPath ? `https://image.tmdb.org/t/p/w500${logoPath}` : undefined
  const [hasLogoError, setHasLogoError] = useState(false)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/network/${network.id}`
  const description = `Explore TV shows airing on ${network.name}.`
  const ogSubtitle = network.headquarters
    ? `${network.headquarters} · TV Network`
    : 'TV Network · Galaxy Movies'
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: network.name,
    subtitle: ogSubtitle,
    ...(logoUrl ? { poster: logoUrl } : {})
  }).toString()}`

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: network.name,
    description,
    url: network.homepage || canonicalUrl,
    logo: logoUrl,
    foundingLocation: network.headquarters
      ? { '@type': 'Place', name: network.headquarters }
      : undefined,
    address: network.origin_country
      ? { '@type': 'PostalAddress', addressCountry: network.origin_country }
      : undefined
  }

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'TV Shows', url: `${siteUrl}/tv` },
    { name: network.name, url: canonicalUrl }
  ]

  return (
    <>
      <Head>
        <title>{`${network.name} Shows | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${network.name} Shows | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${network.name} Shows | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
          }}
        />
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>

      <Box position='relative' minH='100vh' bg='transparent' color='white' py={{ base: 8, md: 12 }} pt={{ base: 14, md: 16 }} px={{ base: 4, md: 12 }}>
        <Box maxW='1200px' mx='auto'>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'center', md: 'flex-start' }}
            gap={8}
            p={{ base: 6, md: 8 }}
            mb={6}
            w='fit-content'
            maxW='100%'
            mx='auto'
          >
            {logoUrl && !hasLogoError ? (
              <Box
                position='relative'
                w='200px'
                h='120px'
                flexShrink={0}
                bg='white'
                p={4}
                borderRadius='xl'
                display='flex'
                alignItems='center'
                justifyContent='center'
              >
                <Image
                  src={logoUrl}
                  alt={`${network.name} logo`}
                  fill
                  priority
                  sizes='200px'
                  onError={() => setHasLogoError(true)}
                  style={{ objectFit: 'contain', padding: '0.5rem' }}
                  unoptimized={logoUrl?.startsWith('/')}
                />
              </Box>
            ) : (
              <Flex
                w='200px'
                h='120px'
                flexShrink={0}
                bg='whiteAlpha.200'
                borderRadius='xl'
                align='center'
                justify='center'
                textAlign='center'
                p={4}
              >
                <Text fontWeight='bold' color='gray.300'>{network.name}</Text>
              </Flex>
            )}

            <Flex direction='column' gap={3} textAlign={{ base: 'center', md: 'left' }} flex={1}>
              <Heading size='xl'>{network.name}</Heading>

              <Flex gap={3} justify={{ base: 'center', md: 'flex-start' }} wrap='wrap' align='center'>
                {network.origin_country && (
                  <Badge colorScheme='purple' fontSize='xs' px={2.5} py={1} borderRadius='md'>
                    {network.origin_country}
                  </Badge>
                )}
                {network.headquarters && (
                  <Text fontSize='sm' color='gray.400'>
                    📍 {network.headquarters}
                  </Text>
                )}
              </Flex>

              {network.homepage && (
                <ChakraLink
                  href={network.homepage}
                  isExternal
                  fontSize='sm'
                  color='purple.300'
                  display='inline-flex'
                  alignItems='center'
                  gap={1}
                  _hover={{ textDecoration: 'underline' }}
                >
                  Official Website <ExternalLinkIcon mx='2px' />
                </ChakraLink>
              )}
            </Flex>
          </Flex>

          <Flex justify='center' gap={10} mb={10}>
            <BackButton />
          </Flex>

          <Flex justify='center' mb={6}>
            <Heading size='lg'>
              Popular Shows
            </Heading>
          </Flex>

          {shows.length === 0 ? (
            <Text color='gray.400' textAlign='center'>No shows found for this network.</Text>
          ) : (
            <MovieGrid movies={shows} />
          )}
        </Box>
      </Box>
    </>
  )
}
