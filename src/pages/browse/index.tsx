import Link from 'next/link'
import { SimpleGrid, Text } from '@chakra-ui/react'
import { movieCategories } from '../../utils/tmdb'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

const categories = Object.entries(movieCategories).map(([key, category]) => ({
  key,
  title: category.title
}))

export default function BrowseIndex() {
  const canonicalUrl = `${SITE_URL}/browse`
  const title = 'Browse Movies'
  const description = 'Browse movies by category — popular picks, now playing, upcoming releases, and Bollywood, Tamil, and Telugu cinema.'

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: categories.map((category) => ({
      '@type': 'WebPage',
      name: category.title,
      url: `${SITE_URL}/browse/${category.key}`
    }))
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
          { name: 'Browse', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400' fontStyle='italic'>
          Looking for something specific? Browse movies by{' '}
          <Link href='/genre' style={{ textDecoration: 'underline' }}>genre</Link>
          {' '}or{' '}
          <Link href='/streaming' style={{ textDecoration: 'underline' }}>streaming service</Link>,
          or check out{' '}
          <Link href='/tv' style={{ textDecoration: 'underline' }}>TV shows</Link>.
        </Text>

        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mt={8}>
          {categories.map((category) => (
            <LinkTile key={category.key} href={`/browse/${category.key}`}>
              <Text fontWeight='medium' textAlign='center'>{category.title}</Text>
            </LinkTile>
          ))}
        </SimpleGrid>
      </PageShell>
    </>
  );
}
