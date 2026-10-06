import type { InferGetStaticPropsType } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { fetchCollection } from '../../utils/tmdb'
import { franchiseCollectionIds } from '../../utils/franchises'
import { tmdbImage, SITE_URL } from '../../utils/site'
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
  const canonicalUrl = `${SITE_URL}/collections`
  const title = 'Movie Franchise Collections'
  const description = 'Every movie in a franchise, in order — Marvel, Harry Potter, Star Wars, James Bond and more, with where each is streaming.'

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Collections', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mt={8}>
          {collections.map((collection) => (
            <Link key={collection.id} href={`/collections/${collection.id}`}>
              <Flex
                direction='column'
                borderRadius='0.5rem'
                border='1px solid var(--chakra-colors-white-alpha-300)'
                overflow='hidden'
                h='100%'
                _hover={{ borderColor: 'whiteAlpha.600' }}
              >
                <Box position='relative' w='100%' aspectRatio='2/3' bg='gray.800'>
                  {collection.posterPath ? (
                    <Image
                      src={tmdbImage(collection.posterPath, 'w342')!}
                      alt={collection.name}
                      fill
                      sizes='(max-width: 768px) 50vw, 25vw'
                      style={{ objectFit: 'cover' }}
                    />
                  ) : null}
                </Box>
                <Box p={3}>
                  <Text fontWeight='medium' fontSize='sm' lineClamp={2}>{collection.name}</Text>
                  <Text fontSize='xs' color='gray.500' mt={1}>{collection.partsCount} movies</Text>
                </Box>
              </Flex>
            </Link>
          ))}
        </SimpleGrid>
      </PageShell>
    </>
  );
}
