import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useInfiniteQuery } from 'react-query'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Box, Flex, IconButton, SimpleGrid, Text } from '@chakra-ui/react'
import { ArrowUpIcon } from '@chakra-ui/icons'
import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import HoverBackground, { useHoverBackground } from '../components/HoverBackground'

export default function Home() {
  const router = useRouter()
  const [category, setCategory] = useState('popular')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const isRestoredRef = useRef(false)
  const { hoveredBg, isBgVisible, handleCardMouseEnter, handleCardMouseLeave } = useHoverBackground()

  useEffect(() => {
    const savedCategory = localStorage.getItem('category')
    if (savedCategory) setCategory(savedCategory)

    const savedSearch = sessionStorage.getItem('homeSearchInput')
    if (savedSearch) {
      setSearchInput(savedSearch)
      setDebouncedSearch(savedSearch.trim())
    }
  }, [])

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400)
    return () => clearTimeout(handler)
  }, [searchInput])

  const activeSearch = debouncedSearch.length > 2 ? debouncedSearch : ''

  const {
    data,
    status,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery(
    ['infiniteMovies', category, activeSearch],
    async ({ pageParam = 1 }) => {
      const url = activeSearch
        ? `/api/allMovies?search=${encodeURIComponent(activeSearch)}&page=${pageParam}`
        : `/api/allMovies?category=${category}&page=${pageParam}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load movies')
      return res.json()
    },
    {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,
      getNextPageParam: (lastPage, pages) => {
        if (!lastPage?.results?.length) return undefined
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
  }, [])

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

  const hasReachedEnd = Boolean(
    data?.pages?.length &&
      (!hasNextPage || data.pages.some((page) => page?.results?.length === 0))
  )

  useEffect(() => {
    const handleRouteChange = () => {
      sessionStorage.setItem('homeScrollPos', window.scrollY.toString())
      sessionStorage.setItem('homeSearchInput', searchInput)
    }

    router.events.on('routeChangeStart', handleRouteChange)
    return () => router.events.off('routeChangeStart', handleRouteChange)
  }, [router, searchInput])

  useEffect(() => {
    if (isRestoredRef.current) return

    const savedPos = sessionStorage.getItem('homeScrollPos')
    if (savedPos && moviesList.length > 0) {
      const targetPos = parseInt(savedPos, 10)
      const timer = setTimeout(() => {
        window.scrollTo({ top: targetPos, behavior: 'instant' })
        isRestoredRef.current = true
        sessionStorage.removeItem('homeScrollPos')
      }, 20)

      return () => clearTimeout(timer)
    }
  }, [moviesList.length])

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 160
      setShowScrollTop((current) => (current === shouldShow ? current : shouldShow))
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const pageTitle = 'Galaxy Movies – Discover Popular & New Films'
  const pageDescription = 'Discover popular movies, browse by genre, and find where to watch them. Galaxy Movies helps you explore new releases, top-rated films, and streaming options all in one place.'
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: 'Galaxy Movies',
    subtitle: 'Discover Popular & New Films'
  }).toString()}`

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Galaxy Movies',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/?search={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name='description' content={pageDescription} />
        <link rel='canonical' href={siteUrl} />
        <link rel='icon' href='/favicon.ico' />

        <meta property='og:type' content='website' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:title' content={pageTitle} />
        <meta property='og:description' content={pageDescription} />
        <meta property='og:url' content={siteUrl} />
        <meta property='og:image' content={ogImage} />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={pageTitle} />
        <meta name='twitter:description' content={pageDescription} />
        <meta name='twitter:image' content={ogImage} />
        <meta name='impact-site-verification' value='1ad17b76-2079-4639-9f17-f65f40948c6b' />
        <meta name="google-adsense-account" content="ca-pub-7970999589560353" />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema).replace(/</g, '\\u003c')
          }}
        />
      </Head>

      <HoverBackground hoveredBg={hoveredBg} isBgVisible={isBgVisible} />

      <Box position='relative' zIndex={1} h='100%' pb='4rem'>
        <Box my={{ base: '2rem', md: '3rem' }}>
          <h1 className='title'>
            <span>Galaxy Movies</span>
          </h1>
        </Box>

        <SearchBar
          category={category}
          changeCategory={changeCategory}
          searchInput={searchInput}
          setSearchInput={setSearchInput}
        />

        {status === 'loading' && moviesList.length === 0 ? (
          <CustomSpinner />
        ) : status === 'error' ? (
          <Text textAlign='center' mt='20rem' fontWeight='bold' fontSize='xl'>
            {error?.message || 'Error loading movies'}
          </Text>
        ) : moviesList.length === 0 ? (
          <Text textAlign='center' mt='10rem' fontWeight='bold' fontSize='xl' color='gray.500'>
            No movies found
          </Text>
        ) : (
          <>
            <InfiniteScroll
              next={fetchNextPage}
              hasMore={Boolean(hasNextPage) && !isFetchingNextPage}
              dataLength={moviesList.length}
              scrollThreshold={0.8}
              loader={
                <Text textAlign='center' color='gray.500' p='1rem'>
                  Loading more movies...
                </Text>
              }
            >
              <SimpleGrid
                my={{ base: '3rem', md: '5rem' }}
                mx={{ base: '1rem', md: '5rem' }}
                spacing={{ base: 8, md: 12 }}
                columns={{ base: 2, md: 5 }}
                minH='100vh'
              >
                {moviesList.map((movie, index) => (
                  <Box
                    key={movie.id}
                    onMouseEnter={() => handleCardMouseEnter(movie.backdrop_path)}
                    onMouseLeave={handleCardMouseLeave}
                  >
                    <MovieCard movie={movie} priority={index < 5} />
                  </Box>
                ))}
              </SimpleGrid>
            </InfiniteScroll>

            {hasReachedEnd && (
              <Text textAlign='center' color='gray.500' p='1rem' mb='3rem'>
                You&apos;ve reached the end.
              </Text>
            )}

            <Flex align='center' justify='center'>
              <Box
                as='footer'
                position='fixed'
                bottom='0'
                left='0'
                right='0'
                mx='auto'
                borderTopRadius='0.5rem'
                zIndex={9}
                py='0.25rem'
                px='0.5rem'
                w='fit-content'
                bg='white'
              >
                <Text textAlign='center' color='gray.600' fontSize='sm'>
                  <Link href='/about'>About</Link> ·{' '}
                  <Link href='/privacy'>Privacy</Link> ·{' '}
                  <Link href='/terms'>Terms</Link> ·{' '}
                  <Link href='/contact'>Contact</Link>
                </Text>
              </Box>
            </Flex>
          </>
        )}

        {showScrollTop && (
          <IconButton
            aria-label='Scroll to top'
            icon={<ArrowUpIcon boxSize={8} />}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            position='fixed'
            right={{ base: '1rem', md: '2rem' }}
            bottom={{ base: '4.5rem', md: '5rem' }}
            zIndex={10}
            borderRadius='full'
            boxShadow='0 0 6px black'
          />
        )}
      </Box>
    </>
  )
}