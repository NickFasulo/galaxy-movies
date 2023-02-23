import { useState, useEffect } from 'react'

export const getServerSideProps = async context => {
  return {
    props: {
      query: context.query
    }
  }
}

export default function Movie({ query }) {
  const [movieInfo, setMovieInfo] = useState({})

  useEffect(() => {
    return async () => {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${query.movieId}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}`
      )
      const movieData = await res.json()
      setMovieInfo(movieData)
    }
  }, [])

  return (
    <div>
      <h1>{movieInfo.title}</h1>
    </div>
  )
}
