import Head from 'next/head'
import React, { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery } from 'react-query'
import ScrollToTop from 'react-scroll-up'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Box, Flex, Input, SimpleGrid } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'
import DropDown from '../components/DropDown'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import { useLocalStorage } from '../hooks/useLocalStorage'

export default function Home() {
  const [category, setCategory] = useLocalStorage('category', 'popular')
  const [allMovies, setAllMovies] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [filteredMovies, setFilteredMovies] = useState([])
  const inputRef = useRef(null)

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    'infiniteMovies',
    async ({ pageParam = 1 }) =>
      await fetch(`/api/allMovies?category=${category}&page=${pageParam}`).then(
        result => result.json()
      ),
    {
      getNextPageParam: (lastPage, pages) => {
        if (pages.length <= 10) {
          return pages.length + 1
        }
      }
    }
  )

  const changeCategory = selectedCat => {
    setCategory(selectedCat)
    if (typeof window !== 'undefined') window.location.reload()
  }

  const searchMovies = () => {
    const searchedMovie = inputRef.current.value
    setSearchInput(searchedMovie)

    if (searchedMovie !== '') {
      const filteredMovies = allMovies.filter(movie => {
        return movie.title.toLowerCase().includes(searchInput.toLowerCase())
      })
      setFilteredMovies(filteredMovies)
    }
  }

  const fetchAllMovies = async () => {
    try {
      let allMoviesArray = []

      for (let i = 1; i <= 10; i++) {
        const result = await fetch(
          `/api/allMovies?category=${category}&page=${i}`
        )
        const movieData = await result.json()
        allMoviesArray.push(movieData.results)
      }

      setAllMovies(allMoviesArray.flatMap(x => x))
    } catch (e) {
      throw new Error(e)
    }
  }

  useEffect(() => {
    fetchAllMovies()
  }, [])

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
          <h1
            style={{
              textAlign: 'center',
              marginTop: '20rem',
              fontWeight: 'bold'
            }}
          >
            Error loading movies
          </h1>
        ) : (
          <>
            <Box margin={{ base: '3rem 0', md: '4rem 0' }}>
              <header margin={0} className='title'>
                Galaxy Movies
              </header>
            </Box>
            <Flex justify='center' align='center' width='100%'>
              <Flex width={{ base: '90%', md: '40rem' }}>
                <Input
                  onChange={e => searchMovies(e.target.value)}
                  ref={inputRef}
                  placeholder='Search movies...'
                  background={'white'}
                />
                <DropDown category={category} changeCategory={changeCategory} />
              </Flex>
            </Flex>

            <InfiniteScroll
              dataLength={data?.pages.length * 20}
              next={fetchNextPage}
              hasMore={hasNextPage}
            >
              <SimpleGrid
                margin={{ base: '4rem 1rem', md: '5rem' }}
                spacing={{ base: 8, md: 12 }}
                columns={{ base: 2, md: 5 }}
              >
                {searchInput.length > 2
                  ? filteredMovies.map(movie => (
                      <MovieCard key={movie.id} movie={movie} />
                    ))
                  : data?.pages.map((page, i) => (
                      <React.Fragment key={i}>
                        {page.results.map(movie => (
                          <MovieCard key={movie.id} movie={movie} />
                        ))}
                      </React.Fragment>
                    ))}
              </SimpleGrid>
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
