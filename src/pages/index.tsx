import Head from 'next/head'
import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useInfiniteQuery, useQueryClient } from 'react-query'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Box, SimpleGrid, Text } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'

import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import type { Movie, MovieCategory, MoviePageResponse } from '../types/movie'

const ScrollToTop = dynamic(
  () => import('react-scroll-up'),
  {
    ssr: false,
    loading: () => null
  }
)

export default function Home(): JSX.Element {
  const [category, setCategory] = useState<MovieCategory>('popular')
  const [searchInput, setSearchInput] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')
  const isRestoredRef = useRef<boolean>(false)

  const queryClient = useQueryClient()

  useEffect(() => {
    const savedCategory = localStorage.getItem('category') as MovieCategory | null
    if (savedCategory) {
      setCategory(savedCategory)
    }

    const savedSearch = sessionStorage.getItem('homeSearchInput')
    if (savedSearch) {
      setSearchInput(savedSearch)
      setDebouncedSearch(savedSearch.trim())
    }
  }, [])

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 400)

    return () => window.clearTimeout(handler)
  }, [searchInput])

  const activeSearch = debouncedSearch.length > 2 ? debouncedSearch : ''

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    ['infiniteMovies', category, activeSearch],
    async ({ pageParam = 1 }) => {
      const url = activeSearch
        ? `/api/allMovies?search=${encodeURIComponent(activeSearch)}&page=${pageParam}`
        : `/api/allMovies?category=${category}&page=${pageParam}`

      const res = await fetch(url)
      return (await res.json()) as MoviePageResponse
    },
    {
      staleTime: 1000 * 60 * 5,
      getNextPageParam: (lastPage, pages) => {
        const totalPages = lastPage?.total_pages ?? 1
        return pages.length < totalPages ? pages.length + 1 : undefined
      }
    }
  )

  const changeCategory = useCallback(
    (selectedCategory: MovieCategory): void => {
      setCategory(selectedCategory)
      localStorage.setItem('category', selectedCategory)
      isRestoredRef.current = true
      sessionStorage.removeItem('homeScrollPos')
      void queryClient.invalidateQueries(['infiniteMovies', selectedCategory])
    },
    [queryClient]
  )

  const moviesList = useMemo<Movie[]>(() => {
    if (!data?.pages) return []

    const seenIds = new Set<number>()
    const uniqueMovies: Movie[] = []

    for (const page of data.pages) {
      if (!page.results) continue
      for (const movie of page.results) {
        if (movie?.id && !seenIds.has(movie.id)) {
          seenIds.add(movie.id)
          uniqueMovies.push(movie)
        }
      }
    }

    return uniqueMovies
  }, [data])

  useEffect(() => {
    const saveHomeState = (): void => {
      sessionStorage.setItem('homeScrollPos', window.scrollY.toString())
      sessionStorage.setItem('homeSearchInput', searchInput)
    }

    window.addEventListener('beforeunload', saveHomeState)
    window.addEventListener('pagehide', saveHomeState)

    return () => {
      window.removeEventListener('beforeunload', saveHomeState)
      window.removeEventListener('pagehide', saveHomeState)
    }
  }, [searchInput])

  useEffect(() => {
    if (isRestoredRef.current) return

    const savedPos = sessionStorage.getItem('homeScrollPos')
    if (savedPos && moviesList.length > 0) {
      const targetPos = Number.parseInt(savedPos, 10)

      const timer = window.setTimeout(() => {
        window.scrollTo({
          top: targetPos,
          behavior: 'instant'
        })
        isRestoredRef.current = true
        sessionStorage.removeItem('homeScrollPos')
      }, 100)

      return () => window.clearTimeout(timer)
    }
  }, [moviesList.length])

  return (
    <>
      <Head>
        <title>Galaxy Movies</title>
        <meta name='description' content='Galaxy Movies' />
        <link rel='icon' href='/favicon.ico' />
      </Head>
      <Box height='100%'>
        {status === 'loading' ? (
          <CustomSpinner />
        ) : status === 'error' ? (
          <Text textAlign='center' marginTop='20rem' fontWeight='bold' fontSize='xl'>
            Error loading movies
          </Text>
        ) : (
          <>
            <Box margin={{ base: '2rem 0', md: '3rem 0' }}>
              <header className='title'>
                <span>Galaxy Movies</span>
              </header>
            </Box>
            <SearchBar
              category={category}
              changeCategory={changeCategory}
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              queryClient={queryClient}
            />
            {moviesList.length === 0 ? (
              <Text
                textAlign='center'
                marginTop='10rem'
                fontWeight='bold'
                fontSize='xl'
                color='gray.500'
              >
                No movies found
              </Text>
            ) : (
              <InfiniteScroll
                next={() => void fetchNextPage()}
                hasMore={Boolean(hasNextPage)}
                dataLength={moviesList.length}
                scrollThreshold={0.8}
                loader={<CustomSpinner />}
              >
                <Box minH='100vh'>
                  <SimpleGrid
                    margin={{ base: '3rem 1rem', md: '5rem' }}
                    spacing={{ base: 8, md: 12 }}
                    columns={{ base: 2, md: 5 }}
                  >
                    {moviesList.map(movie => (
                      <MovieCard key={movie.id} movie={movie} />
                    ))}
                  </SimpleGrid>
                </Box>
              </InfiniteScroll>
            )}
          </>
        )}
        <ScrollToTop
          showUnder={160}
          style={{
            background: 'white',
            borderRadius: 5,
            boxShadow: '0 0 6px black'
          }}
        >
          <ArrowUpIcon boxSize={10} />
        </ScrollToTop>
      </Box>
    </>
  )
}
