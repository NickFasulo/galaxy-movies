import Head from 'next/head'
import { useState, useEffect, useMemo, useCallback } from 'react'
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
  const [category, setCategory] = useState('popular')
  const [searchInput, setSearchInput] = useState('')

  const queryClient = useQueryClient()

  useEffect(() => {
    const savedCategory = localStorage.getItem('category')
    if (savedCategory) {
      setCategory(savedCategory)
    }
  }, [])

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    ['infiniteMovies', category],
    async ({ pageParam = 1 }) => {
      const res = await fetch(`/api/allMovies?category=${category}&page=${pageParam}`)
      return res.json()
    },
    {
      getNextPageParam: (_lastPage, pages) => {
        return pages.length < 15 ? pages.length + 1 : undefined
      }
    }
  )

  const changeCategory = useCallback((selectedCategory) => {
    setCategory(selectedCategory)
    localStorage.setItem('category', selectedCategory)
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

  const filteredMovies = useMemo(() => {
    const query = searchInput.trim().toLowerCase()
    if (query.length <= 2) return moviesList
    return moviesList.filter((movie) =>
      movie.title?.toLowerCase().includes(query)
    )
  }, [moviesList, searchInput])

  return (
    <>
      <Head>
        <title>Galaxy Movies</title>
        <meta name='description' content='Galaxy Movies' />
        <link rel='icon' href='/favicon.ico' />
        <link
          rel='preload'
          href='/asset/space-ranger-font/SpaceRangerLaserItalic-J7an.otf'
          as='font'
          type='font/otf'
          crossOrigin='anonymous'
        />
        <link
          rel='preload'
          href='/asset/space-ranger-font/SpaceRanger-EMJl.otf'
          as='font'
          type='font/otf'
          crossOrigin='anonymous'
        />
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
              <Flex justify='center' align='center'>
                <Flex
                  justify='center'
                  width='100%'
                  padding='0.75rem'
                >
                  <Input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder='Search movies...'
                    background='white'
                    width={{ base: '90%', md: '40rem' }}
                  />
                  <Box padding={{ base: '0 0.25rem', md: '0 0.5rem' }} />
                  <DropDown
                    category={category}
                    changeCategory={changeCategory}
                  />
                </Flex>
              </Flex>
            </Sticky>
            <InfiniteScroll
              next={fetchNextPage}
              hasMore={Boolean(hasNextPage && searchInput.length <= 2)}
              dataLength={filteredMovies.length}
              scrollThreshold={0.8}
            >
              <Box minH='100vh'>
                <SimpleGrid
                  margin={{ base: '3rem 1rem', md: '5rem' }}
                  spacing={{ base: 8, md: 12 }}
                  columns={{ base: 2, md: 5 }}
                >
                  {filteredMovies.map(movie => (
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