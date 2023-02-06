export const getStaticPaths = async () => {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}`
  )
  const moviesData = await res.json()

  const paths = moviesData.results.map(movie => {
    return {
      params: { movieId: movie.id.toString() }
    }
  })

  return {
    paths,
    fallback: false
  }
}

export const getStaticProps = async context => {
  const movieId = context.params.movieId
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.NEXT_PUBLIC_TMDB_KEY}`
  )
  const movieData = await res.json()

  return {
    props: {
      movieData
    }
  }
}

export default function Movie({ movieData }) {
  return (
    <div>
      <h1>{movieData.title}</h1>
    </div>
  )
}
