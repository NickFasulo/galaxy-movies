import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useInfiniteQuery, useQueryClient } from 'react-query'
import ScrollToTop from 'react-scroll-up'
import Sticky from 'react-stickynode'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Box, Flex, Input, SimpleGrid, Text } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'
import DropDown from '../components/DropDown'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'

export default function Home() {
  const router = useRouter()
  const [category, setCategory] = useState('popular')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const isRestoredRef = useRef(false)

  const queryClient = useQueryClient()

  const isSearchActive = searchInput.trim().length > 0

  useEffect(() => {
    const savedCategory = localStorage.getItem('category')
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
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 400)

    return () => clearTimeout(handler)
  }, [searchInput])

  const activeSearch = debouncedSearch.length > 2 ? debouncedSearch : ''

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    ['infiniteMovies', category, activeSearch],
    async ({ pageParam = 1 }) => {
      const url = activeSearch
        ? `/api/allMovies?search=${encodeURIComponent(activeSearch)}&page=${pageParam}`
        : `/api/allMovies?category=${category}&page=${pageParam}`
      const res = await fetch(url)
      return res.json()
    },
    {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,
      getNextPageParam: (lastPage, pages) => {
        const totalPages = lastPage?.total_pages || 1
        return pages.length < totalPages ? pages.length + 1 : undefined
      }
    }
  )

  const changeCategory = useCallback((selectedCategory) => {
    setCategory(selectedCategory)
    localStorage.setItem('category', selectedCategory)
    isRestoredRef.current = true
    sessionStorage.removeItem('homeScrollPos')
    sessionStorage.removeItem('homeSearchInput')
    queryClient.invalidateQueries(['infiniteMovies', selectedCategory])
  }, [queryClient])

  const moviesList = useMemo(() => {
    if (!data?.pages) return []

    const seenIds = new Set()
    const uniqueMovies = []

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
    const handleRouteChange = () => {
      sessionStorage.setItem('homeScrollPos', window.scrollY.toString())
      sessionStorage.setItem('homeSearchInput', searchInput)
    }

    router.events.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router, searchInput])

  useEffect(() => {
    if (isRestoredRef.current) return

    const savedPos = sessionStorage.getItem('homeScrollPos')
    if (savedPos && moviesList.length > 0) {
      const targetPos = parseInt(savedPos, 10)

      const timer = setTimeout(() => {
        window.scrollTo({
          top: targetPos,
          behavior: 'instant'
        })
        isRestoredRef.current = true
        sessionStorage.removeItem('homeScrollPos')
      }, 100)

      return () => clearTimeout(timer)
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
          <Text
            textAlign='center'
            marginTop='20rem'
            fontWeight='bold'
            fontSize='xl'
          >
            Error loading movies
          </Text>
        ) : (
          <>
            <Box margin={{ base: '2rem 0', md: '3rem 0' }}>
              <header className='title'>
                <span>Galaxy Movies</span>
              </header>
            </Box>
            <Sticky innerActiveClass='sticky-header-active'>
              <Flex justify='center' align='center' width='100%'>
                <Flex
                  justify='center'
                  align='center'
                  width={{ base: '90%', md: '50rem' }}
                  padding='0.75rem'
                  overflow='hidden'
                >
                  <Input
                    value={searchInput}
                    onChange={e => {
                      setSearchInput(e.target.value)
                      if (e.target.value === '') {
                        sessionStorage.removeItem('homeSearchInput')
                      }
                    }}
                    placeholder='Search movies...'
                    background='white'
                    flex='1'
                  />
                  <Box
                    maxWidth={isSearchActive ? '0px' : '200px'}
                    opacity={isSearchActive ? 0 : 1}
                    pointerEvents={isSearchActive ? 'none' : 'auto'}
                    marginLeft={isSearchActive ? '0px' : '0.75rem'}
                    transition='all 0.3s ease-in-out'
                    overflow='hidden'
                    whiteSpace='nowrap'
                  >
                    <DropDown
                      category={category}
                      changeCategory={changeCategory}
                    />
                  </Box>
                </Flex>
              </Flex>
            </Sticky>
            <InfiniteScroll
              next={fetchNextPage}
              hasMore={Boolean(hasNextPage)}
              dataLength={moviesList.length}
              scrollThreshold={0.8}
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