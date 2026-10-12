import { useMemo } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import type { TitleSummary } from '../types/tmdb'

interface FeedPage {
  results?: TitleSummary[]
  total_pages?: number
}

// Auto-load only this many scroll pages, then switch to an explicit button —
// deeper scroll would bury the sibling links and footer below the grid.
const AUTO_PAGES = 3

export default function PaginatedGrid({ initialTitles, initialTotalPages, queryKey, fetchUrl, posterFallback }: {
  initialTitles: TitleSummary[]
  initialTotalPages: number
  queryKey: readonly unknown[]
  fetchUrl: (page: number) => string
  posterFallback?: string
}) {
  const {
    data,
    status,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery<FeedPage>({
    queryKey: ['pagedGrid', ...queryKey],
    queryFn: async ({ pageParam }) => {
      const resp = await fetch(fetchUrl(Number(pageParam)))
      if (!resp.ok) throw new Error('Failed to load titles')
      return resp.json() as Promise<FeedPage>
    },
    initialPageParam: 1,
    initialData: { pages: [{ results: initialTitles, total_pages: initialTotalPages }], pageParams: [1] },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage?.results?.length) return undefined
      const totalPages = lastPage?.total_pages || 1
      return pages.length < totalPages ? pages.length + 1 : undefined
    }
  })

  const titles = useMemo(() => {
    const seen = new Set<string>()
    const out: TitleSummary[] = []
    for (const page of data?.pages || []) {
      for (const t of page.results || []) {
        const key = `${t.mediaType || 'movie'}:${t.id}`
        if (t?.id && !seen.has(key)) {
          seen.add(key)
          out.push(t)
        }
      }
    }
    return out
  }, [data])

  const loadedPages = data?.pages.length ?? 1
  const autoLoad = loadedPages < AUTO_PAGES

  return (
    <Box>
      <InfiniteScroll
        next={fetchNextPage}
        hasMore={autoLoad && Boolean(hasNextPage) && !isFetchingNextPage}
        dataLength={titles.length}
        scrollThreshold={0.95}
        loader={<Text textAlign='center' color='gray.500' p='1rem'>Loading more titles...</Text>}
      >
        <MovieGrid movies={titles} posterFallback={posterFallback} />
      </InfiniteScroll>
      {status === 'error' && (
        <Text textAlign='center' color='gray.500' mb={4}>Couldn&rsquo;t load more titles — try again.</Text>
      )}
      {(!autoLoad || status === 'error') && hasNextPage && (
        <Flex justify='center' mb={8}>
          <Button
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
            bg='surface.raised'
            color='white'
            border='1px solid var(--chakra-colors-border-subtle)'
            _hover={{ bg: 'surface.overlay' }}
            data-umami-event='load-more'
          >Load more</Button>
        </Flex>
      )}
      {!hasNextPage && loadedPages > 1 && (
        <Text textAlign='center' color='gray.500' p='1rem' mb='2rem'>You&rsquo;ve reached the end.</Text>
      )}
    </Box>
  )
}
