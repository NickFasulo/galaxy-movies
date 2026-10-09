import type { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { curatedLists } from '../../utils/curatedLists'
import { getGeneratedLists } from '../../utils/generatedLists'
import { setSwrCache } from '../../utils/ssr'
import { itemListSchema } from '../../utils/schema'
import { SITE_URL } from '../../utils/site'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import LinkTile from '../../components/LinkTile'

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  const generated = await getGeneratedLists()
  const generatedLists = Object.entries(generated).map(([slug, list]) => ({
    slug,
    title: list.title,
    tagline: list.tagline
  }))

  setSwrCache(res, 86400, 604800)
  return { props: { generatedLists } }
}

export default function ListsIndex({ generatedLists = [] }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const canonicalUrl = `${SITE_URL}/lists`
  const title = 'Curated Movie Lists & Mood Picks'
  const description = 'Editorial movie collections for every mood — from cozy night-in picks to mind-bending thrillers and underrated 90s gems.'

  const staticEntries = Object.entries(curatedLists).map(([slug, list]) => ({ slug, ...list }))
  const moodLists = staticEntries.filter((entry) => entry.group === 'mood')
  const curatedOnly = staticEntries.filter((entry) => entry.group === 'curated')
  const guides = staticEntries.filter((entry) => entry.group === 'guides')
  const entries = [...staticEntries, ...generatedLists]

  const itemListData = itemListSchema({
    name: title,
    description,
    url: canonicalUrl,
    items: entries.map((entry) => ({
      '@type': 'WebPage',
      name: entry.title,
      url: `${SITE_URL}/lists/${entry.slug}`
    }))
  })

  const renderCard = (entry: { slug: string; title: string; tagline: string }) => (
    <LinkTile key={entry.slug} href={`/lists/${entry.slug}`} column>
      <Text fontWeight='semibold'>{entry.title}</Text>
      <Text fontSize='sm' color='gray.400' mt={1}>{entry.tagline}</Text>
    </LinkTile>
  )

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        structuredData={itemListData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Lists', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Mood Picks</Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          {moodLists.map(renderCard)}
        </SimpleGrid>

        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Curated Collections</Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          {curatedOnly.map(renderCard)}
        </SimpleGrid>

        {guides.length > 0 && (
          <>
            <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Guides</Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              {guides.map(renderCard)}
            </SimpleGrid>
          </>
        )}

        {generatedLists.length > 0 && (
          <>
            <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>Fresh Collections</Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              {generatedLists.map(renderCard)}
            </SimpleGrid>
          </>
        )}
      </PageShell>
    </>
  );
}
