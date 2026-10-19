import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { Flex, Text } from '@chakra-ui/react'
import MovieGrid from '../../features/catalog/components/MovieGrid'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import AffiliateTextLink from '../../features/monetize/components/AffiliateTextLink'
import { GRUV_AFFILIATE_PIXEL, buildGruvLink } from '../../features/monetize/affiliates'
import { resolveGruvBoxSet, type GruvProduct } from '../../features/monetize/gruv'
import { getRedis } from '../../lib/redis'
import { fetchCollection } from '../../features/catalog/tmdb'
import { setSwrCache } from '../../lib/http'
import { titleListSchema } from '../../features/catalog/schema'
import { SITE_URL } from '../../lib/site'
import type { TmdbMovie } from '../../types/tmdb'

interface Props {
  collection: { id: number; name: string; overview: string }
  movies: TmdbMovie[]
  boxSet: GruvProduct | null
}

const BOXSET_TTL_SECONDS = 60 * 60 * 24 * 7

// One Redis read per SSR hit; 'none' sentinel caches misses so franchises with
// no Gruv set don't refetch on every pageview.
async function getCollectionBoxSet(collectionId: string, name: string): Promise<GruvProduct | null> {
  const kv = getRedis()
  const cacheKey = `gruv:boxset:${collectionId}`
  if (kv) {
    try {
      const cached = await kv.get<GruvProduct | 'none'>(cacheKey)
      if (cached) return cached === 'none' ? null : cached
    } catch {}
  }
  const product = await resolveGruvBoxSet({ name })
  if (kv) {
    try {
      await kv.set(cacheKey, product || 'none', { ex: BOXSET_TTL_SECONDS })
    } catch {}
  }
  return product
}

export async function getServerSideProps({ params, res }: GetServerSidePropsContext<{ collectionId: string }>): Promise<GetServerSidePropsResult<Props>> {
  const collectionId = params?.collectionId ?? ''
  if (!/^\d+$/.test(collectionId)) {
    return { notFound: true }
  }

  try {
    const collection = await fetchCollection(collectionId)
    if (!collection?.id) {
      return { notFound: true }
    }

    const parts = (collection.parts || [])
      .filter((movie) => movie.poster_path)
      .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    setSwrCache(res, 86400, 604800)
    const boxSet = await getCollectionBoxSet(collectionId, collection.name)
    return { props: { collection: { id: collection.id, name: collection.name, overview: collection.overview || '' }, movies: parts, boxSet } }
  } catch (error) {
    console.error(error)
    return { notFound: true }
  }
}

export default function Collection({ collection, movies, boxSet }: Props) {
  const canonicalUrl = `${SITE_URL}/collections/${collection.id}`
  const title = `${collection.name} Movies in Order`
  const description = collection.overview
    ? collection.overview.slice(0, 160)
    : `All ${movies.length} ${collection.name} movies in release order — and where each one is streaming now.`

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        posterPath={movies[0]?.poster_path}
        structuredData={titleListSchema({ name: title, description, url: canonicalUrl, titles: movies, limit: movies.length })}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Collections', url: `${SITE_URL}/collections` },
          { name: collection.name, url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {boxSet && (
          <Flex mt={2}>
            <AffiliateTextLink href={buildGruvLink(boxSet.url)} pixel={GRUV_AFFILIATE_PIXEL} text='Buy the box set at Gruv' event='gruv-click' />
          </Flex>
        )}
        <MovieGrid movies={movies} />

        <Text textAlign='center' mt={8} color='gray.400'>
          Sorted by release date — check each movie page for current streaming, rent and buy options.
        </Text>
      </PageShell>
    </>
  );
}
