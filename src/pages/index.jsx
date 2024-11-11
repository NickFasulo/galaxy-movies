import Head from 'next/head'
import React, { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery, useQueryClient } from 'react-query'
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
  const [filteredMovies, setFilteredMovies] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [allMovies, setAllMovies] = useState([])
  const [atTop, setAtTop] = useState(false)
  const headerRef = useRef(null)
  const inputRef = useRef(null)

  const queryClient = useQueryClient()

  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    ['infiniteMovies', category],
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

  const changeCategory = selectedCategory => {
    setCategory(selectedCategory)
    queryClient.invalidateQueries(['infiniteMovies', selectedCategory])
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

  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        const inputTop = headerRef.current.getBoundingClientRect().top
        setAtTop(inputTop === 0)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
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
            <Box margin={{ base: '2rem 0', md: '3rem 0' }}>
              <header margin={0} className='title'>
                Galaxy Movies
              </header>
            </Box>
            <Flex
              ref={headerRef}
              justify='center'
              align='center'
              position='sticky'
              top='0'
              zIndex='1000'
              background={atTop ? 'white' : 'transparent'}
            >
              <Flex
                justify={'center'}
                width={'100%'}
                padding={{ base: '1rem', md: '1.25rem' }}
              >
                <Input
                  ref={inputRef}
                  onChange={e => searchMovies(e.target.value)}
                  placeholder='Search movies...'
                  background={'white'}
                  width={{ base: '90%', md: '40rem' }}
                />
                <Box padding={{ base: '0 0.25rem', md: '0 0.5rem' }} />
                <DropDown category={category} changeCategory={changeCategory} />
              </Flex>
            </Flex>
            <InfiniteScroll
              next={fetchNextPage}
              hasMore={hasNextPage}
              dataLength={data?.pages.length * 20}
            >
              <SimpleGrid
                margin={{ base: '3rem 1rem', md: '5rem' }}
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
