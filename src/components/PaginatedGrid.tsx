import { useMemo, type ComponentProps } from 'react'
import Link from 'next/link'
import InfiniteScroll from 'react-infinite-scroll-component'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Box, Flex, Text } from '@chakra-ui/react'
import MovieGrid from './MovieGrid'
import CustomSpinner from './CustomSpinner'
import type { TitleSummary } from '../types/tmdb'

export interface FeedPage {
  results?: TitleSummary[]
  total_pages?: number
  page?: number
}

interface FeedOptions {
  queryKey: readonly unknown[]
  fetchUrl?: (page: number) => string
  queryFn?: (page: number) => Promise<FeedPage>
  initialTitles?: TitleSummary[]
  initialTotalPages?: number
  initialPage?: number
}

// Shared infinite-feed query: dedupes across pages on mediaType:id. Pages
// that need the titles outside the grid (badges, client filters, scroll
// restore) use this hook directly with InfiniteTitleGrid. `initialPage`
// lets SSR seed a deep page (?page=N) — the feed continues from N+1.
export function usePaginatedFeed({ queryKey, fetchUrl, queryFn, initialTitles, initialTotalPages = 1, initialPage = 1 }: FeedOptions) {
  const query = useInfiniteQuery<FeedPage>({
    queryKey: ['pagedGrid', ...queryKey],
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam)
      const data = queryFn ? await queryFn(page) : await (async () => {
        const resp = await fetch(fetchUrl!(page))
        if (!resp.ok) throw new Error('Failed to load titles')
        return resp.json() as Promise<FeedPage>
      })()
      return { ...data, page }
    },
    initialPageParam: initialTitles ? initialPage + 1 : 1,
    initialData: initialTitles
      ? { pages: [{ results: initialTitles, total_pages: initialTotalPages, page: initialPage }], pageParams: [initialPage] }
      : undefined,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.results?.length) return undefined
      const page = lastPage.page ?? 0
      return page < (lastPage.total_pages || 1) ? page + 1 : undefined
    }
  })

  const titles = useMemo(() => {
    const seen = new Set<string>()
    const out: TitleSummary[] = []
    for (const page of query.data?.pages || []) {
      for (const t of page.results || []) {
        const key = `${t.mediaType || 'movie'}:${t.id}`
        if (t?.id && !seen.has(key)) {
          seen.add(key)
          out.push(t)
        }
      }
    }
    return out
  }, [query.data])

  return { ...query, titles }
}

type GridProps = Omit<ComponentProps<typeof MovieGrid>, 'movies'>

interface InfiniteTitleGridProps {
  titles: TitleSummary[]
  hasData: boolean
  status: 'pending' | 'error' | 'success'
  loadedPages: number
  fetchNextPage: () => unknown
  hasNextPage: boolean
  isFetchingNextPage: boolean
  filterTitles?: (titles: TitleSummary[]) => TitleSummary[]
  emptyMessage?: string
  posterFallback?: string
  gridProps?: GridProps
  pagination?: { page: number; totalPages: number; hrefFor: (page: number) => string }
}

// Shared infinite-scroll shell: unlimited auto-load (homepage behavior — the
// in-flow footer can't be reached past an endless feed, so these pages use
// the floating FooterPill instead of a Load-more gate).
export function InfiniteTitleGrid({
  titles,
  hasData,
  status,
  loadedPages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  filterTitles,
  emptyMessage,
  posterFallback,
  gridProps,
  pagination
}: InfiniteTitleGridProps) {
  const visibleTitles = useMemo(
    () => (filterTitles ? filterTitles(titles) : titles),
    [filterTitles, titles]
  )

  if (!hasData && status !== 'error') {
    return <Flex justify='center' py={16}><CustomSpinner /></Flex>
  }

  return (
    <Box>
      {pagination && pagination.totalPages > 1 && (
        <Flex justify='center' align='center' gap={4} mb={4} fontSize='sm' color='gray.500'>
          {pagination.page > 1 && <Link href={pagination.hrefFor(pagination.page - 1)}>← Previous</Link>}
          <Text>Page {pagination.page} of {pagination.totalPages}</Text>
          {pagination.page < pagination.totalPages && <Link href={pagination.hrefFor(pagination.page + 1)}>Next →</Link>}
        </Flex>
      )}
      {visibleTitles.length === 0 && emptyMessage ? (
        <Text textAlign='center' color='gray.500' py={16}>{emptyMessage}</Text>
      ) : (
        <InfiniteScroll
          next={fetchNextPage}
          hasMore={hasNextPage && !isFetchingNextPage}
          dataLength={visibleTitles.length}
          scrollThreshold={0.95}
          loader={<Text textAlign='center' color='gray.500' p='1rem'>Loading more titles...</Text>}
        >
          <MovieGrid movies={visibleTitles} posterFallback={posterFallback} {...gridProps} />
        </InfiniteScroll>
      )}
      {status === 'error' && (
        <Text textAlign='center' color='gray.500' mb={4}>Couldn&rsquo;t load titles — try again.</Text>
      )}
      {!hasNextPage && loadedPages > 1 && (
        <Text textAlign='center' color='gray.500' p='1rem' mb='2rem'>You&rsquo;ve reached the end.</Text>
      )}
    </Box>
  )
}

// One-shot wrapper for catalog/search pages: feed hook + scroll shell.
export default function PaginatedGrid({
  queryKey,
  fetchUrl,
  queryFn,
  initialTitles,
  initialTotalPages,
  ...renderProps
}: FeedOptions & Omit<InfiniteTitleGridProps, 'titles' | 'hasData' | 'status' | 'loadedPages' | 'fetchNextPage' | 'hasNextPage' | 'isFetchingNextPage'>) {
  const feed = usePaginatedFeed({ queryKey, fetchUrl, queryFn, initialTitles, initialTotalPages })
  return (
    <InfiniteTitleGrid
      titles={feed.titles}
      hasData={Boolean(feed.data)}
      status={feed.status}
      loadedPages={feed.data?.pages.length ?? 1}
      fetchNextPage={feed.fetchNextPage}
      hasNextPage={Boolean(feed.hasNextPage)}
      isFetchingNextPage={feed.isFetchingNextPage}
      {...renderProps}
    />
  )
}
