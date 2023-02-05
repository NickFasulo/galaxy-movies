import Head from 'next/head'
import { Wrap, Box } from '@chakra-ui/react'
import { useInfiniteQuery } from 'react-query'
import MovieCard from '../components/MovieCard'
import CustomSpinner from '../components/CustomSpinner'
import InfiniteScroll from 'react-infinite-scroll-component'

export default function Home() {
  const { data, status, fetchNextPage, hasNextPage } = useInfiniteQuery(
    'infiniteMovies',
    async ({ pageParam = 1 }) =>
      await fetch(
        `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}&page=${pageParam}`
      ).then(result => result.json()),
    {
      getNextPageParam: (lastPage, pages) => {
        // console.log({ lastPage })
        // if (lastPage.info.next) {
        return pages.length + 1
        // }
      }
    }
  )

  return (
    <>
      <Head>
        <title>Top Stuff</title>
        <meta name='description' content='Top Stuff' />
        <link rel='icon' href='/favicon.ico' />
      </Head>

      <Box height='100vh'>
        {status !== 'success' ? (
          <CustomSpinner />
        ) : (
          <InfiniteScroll
            dataLength={data?.pages.length * 20}
            next={fetchNextPage}
            hasMore={hasNextPage}
            loader={<h2 style={{ textAlign: 'center' }}>Loading...</h2>}
            endMessage={
              <p style={{ textAlign: 'center' }}>
                <b>End of movie list</b>
              </p>
            }
          >
            <Wrap justify='center'>
              {data?.pages.map(page => (
                <>
                  {page.results.map((movie, i) => (
                    <MovieCard
                      key={i}
                      backdrop_path={movie.backdrop_path}
                      genre_ids={movie.genre_ids}
                      id={movie.id}
                      original_language={movie.original_language}
                      overview={movie.overview}
                      popularity={movie.popularity}
                      poster_path={movie.poster_path}
                      title={movie.title}
                      vote_average={movie.vote_average}
                    />
                  ))}
                </>
              ))}
            </Wrap>
          </InfiniteScroll>
        )}
      </Box>
    </>
  )
}
