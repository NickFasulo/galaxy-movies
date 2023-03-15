import Head from 'next/head'
import React, { useState, useEffect } from 'react'
import { useInfiniteQuery } from 'react-query'
import ScrollToTop from 'react-scroll-up'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Wrap, Box, Flex, Input } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'
import DropDown from '../components/DropDown'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import { useLocalStorage } from '../hooks/useLocalStorage'

export default function Home() {
  const [category, setCategory] = useLocalStorage('category', 'popular')
  const [allMovies, setAllMovies] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [filteredResults, setFilteredResults] = useState([])

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    'infiniteMovies',
    async ({ pageParam = 1 }) =>
      await fetch(
        `https://api.themoviedb.org/3/movie/${category}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}&page=${pageParam}`
      ).then(result => result.json()),
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

  const searchMovies = searchValue => {
    setSearchInput(searchValue)
    if (searchInput !== '') {
      const filteredData = allMovies.filter(movie => {
        return movie.title.toLowerCase().includes(searchInput.toLowerCase())
      })
      setFilteredResults(filteredData)
    }
  }

  const fetchAllMovies = async () => {
    try {
      let allMoviesArray = []

      for (let i = 1; i <= 10; i++) {
        const result = await fetch(
          `https://api.themoviedb.org/3/movie/${category}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}&page=${i}`
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
        <title>Top Stuff</title>
        <meta name='description' content='Top Stuff' />
        <link rel='icon' href='/favicon.ico' />
      </Head>

      <Box height='100%'>
        {status === 'loading' ? (
          <CustomSpinner />
        ) : status === 'error' ? (
          <h1
            style={{
              textAlign: 'center',
              marginTop: '10rem',
              fontWeight: 'bold'
            }}
          >
            Error loading movies
          </h1>
        ) : (
          <>
            <Flex justify='center' align='center' width='100%'>
              <Flex margin='2rem 0' width={{ base: '85%', md: '40rem' }}>
                <Input
                  onChange={e => searchMovies(e.target.value)}
                  placeholder='Search movies...'
                />
                <DropDown category={category} changeCategory={changeCategory} />
              </Flex>
            </Flex>

            <InfiniteScroll
              dataLength={data?.pages.length * 20}
              next={fetchNextPage}
              hasMore={hasNextPage}
            >
              <Wrap justify='center'>
                {searchInput.length > 1
                  ? filteredResults.map(movie => (
                      <MovieCard key={movie.id} movie={movie} />
                    ))
                  : data?.pages.map((page, i) => (
                      <React.Fragment key={i}>
                        {page.results.map(movie => (
                          <MovieCard key={movie.id} movie={movie} />
                        ))}
                      </React.Fragment>
                    ))}
              </Wrap>
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
