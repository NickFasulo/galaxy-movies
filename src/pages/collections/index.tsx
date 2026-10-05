import type { InferGetStaticPropsType } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import BackButton from '../../components/BackButton'
import { fetchCollection } from '../../utils/tmdb'
import { franchiseCollectionIds } from '../../utils/franchises'
import type { TmdbCollection } from '../../types/tmdb'

export async function getStaticProps() {
  const results = await Promise.allSettled(
    franchiseCollectionIds.map((id) => fetchCollection(id))
  )

  const collections = results
    .filter((r): r is PromiseFulfilledResult<TmdbCollection> => r.status === 'fulfilled' && Boolean(r.value?.id))
    .map((r) => ({
      id: r.value.id,
      name: r.value.name,
      overview: r.value.overview || '',
      posterPath: r.value.poster_path,
      partsCount: (r.value.parts || []).length
    }))

  return {
    props: { collections },
    revalidate: 86400
  }
}

export default function Collections({ collections }: InferGetStaticPropsType<typeof getStaticProps>) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/collections`
  const title = 'Movie Franchise Collections'
  const description = 'Every movie in a franchise, in order — Marvel, Harry Potter, Star Wars, James Bond and more, with where each is streaming.'
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({ title, subtitle: description }).toString()}`

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Collections', url: canonicalUrl }
  ]

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

        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={{ base: 6, md: 10 }}>
        <Box maxW='70rem' mx='auto' px={6}>
          <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
          <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>

          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mt={8}>
            {collections.map((collection) => (
              <Link key={collection.id} href={`/collections/${collection.id}`}>
                <Flex
                  direction='column'
                  borderRadius='0.75rem'
                  border='1px solid'
                  borderColor='whiteAlpha.300'
                  overflow='hidden'
                  h='100%'
                  _hover={{ borderColor: 'whiteAlpha.600' }}
                >
                  <Box position='relative' w='100%' aspectRatio='2/3' bg='gray.800'>
                    {collection.posterPath ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w342${collection.posterPath}`}
                        alt={collection.name}
                        fill
                        sizes='(max-width: 768px) 50vw, 25vw'
                        style={{ objectFit: 'cover' }}
                      />
                    ) : null}
                  </Box>
                  <Box p={3}>
                    <Text fontWeight='medium' fontSize='sm' noOfLines={2}>{collection.name}</Text>
                    <Text fontSize='xs' color='gray.500' mt={1}>{collection.partsCount} movies</Text>
                  </Box>
                </Flex>
              </Link>
            ))}
          </SimpleGrid>

          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        </Box>
      </Box>
    </>
  )
}
