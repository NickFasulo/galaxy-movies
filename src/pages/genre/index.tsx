import Link from 'next/link'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { movieGenres, tvGenres } from '../../utils/tmdb'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

const genres = Object.entries(movieGenres).map(([key, genre]) => ({
  key,
  title: genre.title
}))

const showGenres = Object.entries(tvGenres).map(([key, genre]) => ({
  key,
  title: genre.title
}))

export default function GenreIndex() {
  const canonicalUrl = `${SITE_URL}/genre`
  const title = 'Movie & TV Genres'
  const description = 'Browse movies and shows by genre — action, comedy, drama, horror, sci-fi, documentaries, and more.'

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: [
      ...genres.map((genre) => ({
        '@type': 'WebPage',
        name: genre.title,
        url: `${SITE_URL}/genre/${genre.key}`
      })),
      ...showGenres.map((genre) => ({
        '@type': 'WebPage',
        name: genre.title,
        url: `${SITE_URL}/tv/genre/${genre.key}`
      }))
    ]
  })

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Genres', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Prefer to browse differently? See movies by{' '}
          <Link href='/browse' style={{ textDecoration: 'underline' }}>category</Link>
          {' '}or{' '}
          <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>.
        </Text>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Movie Genres</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {genres.map((genre) => (
            <LinkTile key={genre.key} href={`/genre/${genre.key}`}>
              <Text fontWeight='medium' textAlign='center'>{genre.title}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>TV Genres</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          {showGenres.map((genre) => (
            <LinkTile key={genre.key} href={`/tv/genre/${genre.key}`}>
              <Text fontWeight='medium' textAlign='center'>{genre.title}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
      </PageShell>
    </>
  );
}
