import Head from 'next/head'
import React, { useState, useEffect } from 'react'
import { Wrap, Box, Flex, Input } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'
import { useInfiniteQuery } from 'react-query'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import InfiniteScroll from 'react-infinite-scroll-component'
import ScrollToTop from 'react-scroll-up'

export default function Home() {
  const [allMovies, setAllMovies] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [filteredResults, setFilteredResults] = useState([])
  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    'infiniteMovies',
    async ({ pageParam = 1 }) =>
      await fetch(
        `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}&page=${pageParam}`
      ).then(result => result.json()),
    {
      getNextPageParam: (lastPage, pages) => {
        if (pages.length <= 10) {
          return pages.length + 1
        }
      }
    }
  )

  const fetchAllMovies = async () => {
    try {
      let allMoviesArray = []

      for (let i = 1; i <= 10; i++) {
        const result = await fetch(
          `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}&page=${i}`
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

  const searchMovies = searchValue => {
    setSearchInput(searchValue)
    if (searchInput !== '') {
      const filteredData = allMovies.filter(movie => {
        return movie.title.toLowerCase().includes(searchInput.toLowerCase())
      })
      setFilteredResults(filteredData)
    }
  }

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
            <Flex justify='center' width='100%'>
              <Input
                onChange={e => searchMovies(e.target.value)}
                placeholder='Search movies...'
                width={{ base: '80%', md: '40rem' }}
                margin='2rem auto'
              />
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
        <ScrollToTop showUnder={160} style={{ background: 'white', borderRadius: 5, boxShadow: '0 0 6px black'}}>
          <ArrowUpIcon boxSize={10} />
        </ScrollToTop>
      </Box>
    </>
  )
}
