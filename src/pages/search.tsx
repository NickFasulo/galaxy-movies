import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'
import PaginatedGrid from '../components/PaginatedGrid'
import PageHead from '../components/PageHead'
import SearchInput from '../components/SearchInput'
import StickySearchBar from '../components/StickySearchBar'
import { fetchTmdb, normalizeTvTitle } from '../utils/tmdb'
import { setSwrCache } from '../utils/ssr'
import type { TitleSummary, TmdbPaged, TmdbTvShow } from '../types/tmdb'

interface Props {
  initialQ: string
  initialTitles: TitleSummary[]
  initialTotalPages: number
}

type RawResult = TitleSummary & TmdbTvShow

const MAX_SEARCH_LENGTH = 100
const MIN_SEARCH_LENGTH = 3

export async function getServerSideProps({ res, query }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const initialQ = (typeof query.q === 'string' ? query.q : '').trim().slice(0, MAX_SEARCH_LENGTH)
  let initialTitles: TitleSummary[] = []
  let initialTotalPages = 1

  if (initialQ.length >= MIN_SEARCH_LENGTH) {
    const data = await fetchTmdb<TmdbPaged<RawResult>>('/search/multi', {
      query: initialQ,
      page: 1,
      include_adult: 'false'
    }).catch(() => null)
    if (data) {
      initialTitles = (data.results || [])
        .filter((item) => item?.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'))
        .map((item) => (item.media_type === 'movie' ? { ...item, mediaType: 'movie' as const } : normalizeTvTitle(item)))
      initialTotalPages = data.total_pages || 1
    }
  }

  setSwrCache(res, 3600, 86400)
  return { props: { initialQ, initialTitles, initialTotalPages } }
}

export default function SearchPage({ initialQ, initialTitles, initialTotalPages }: Props) {
  const router = useRouter()
  const q = typeof router.query.q === 'string' ? router.query.q : ''
  const [input, setInput] = useState(initialQ)
  const [debounced, setDebounced] = useState(initialQ)

  // Back/forward nav changes ?q — resync input state during render (a lazy
  // initializer can't see post-mount query changes).
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    if (q !== input.trim()) setInput(q)
    setDebounced(q.trim())
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      const term = input.trim()
      setDebounced(term)
      // Keep ?q shareable without a history entry per keystroke.
      if (term !== q) {
        router.replace(term ? `/search?q=${encodeURIComponent(term)}` : '/search', undefined, { shallow: true })
      }
    }, 400)
    return () => clearTimeout(handler)
  }, [input, q, router])

  const active = debounced.length >= MIN_SEARCH_LENGTH ? debounced : ''

  return (
    <>
      <PageHead
        title={active ? `${active} — Search` : 'Search'}
        description='Search movies and TV shows on Galaxy Movies.'
        noindex
        hreflang={false}
      />
      {/* Same top clearance as PageShell — the dark-page header is absolute. */}
      <Box flex='1' pt={{ base: '5rem', md: '6rem' }} pb='4rem'>
        <StickySearchBar>
          <Box maxW='40rem' mx='auto' px={4} py={3}>
            <SearchInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label='Search movies and shows'
              enterKeyHint='search'
              autoFocus
            />
          </Box>
        </StickySearchBar>
        <Box maxW='70rem' mx='auto' px={6}>
          {!active ? (
            <Text textAlign='center' color='gray.500' mt='5rem'>
              Search for a movie or TV show.
            </Text>
          ) : (
            <PaginatedGrid
              key={active}
              initialTitles={active === initialQ ? initialTitles : undefined}
              initialTotalPages={initialTotalPages}
              queryKey={['search', active]}
              fetchUrl={(page) => `/api/allMovies?search=${encodeURIComponent(active)}&media=trending&page=${page}`}
              emptyMessage={`No results for “${active}”.`}
            />
          )}
        </Box>
      </Box>
    </>
  )
}
