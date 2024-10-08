import supabase from '../../lib/supabaseClient'
const TMDB_API_KEY = process.env.TMDB_API_KEY

const fetchMoviesFromCategory = async (category, page) => {
  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${category}?api_key=${TMDB_API_KEY}&page=${page}`
  )
  const data = await response.json()
  return data.results
}

const fetchAndInsertGenres = async () => {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`
    )
    const { genres } = await response.json()

    for (const genre of genres) {
      const { data: existingGenre } = await supabase
        .from('genres')
        .select('id')
        .eq('id', genre.id)
        .single()

      if (!existingGenre) {
        const { error } = await supabase
          .from('genres')
          .insert([{ id: genre.id, name: genre.name }])

        if (error) {
          console.error('Error inserting genre:', error)
          throw error
        }
      }
    }
  } catch (error) {
    console.error('Error fetching or inserting genres:', error)
  }
}

const deleteMoviesFromDB = async (categoryId, limit) => {
  const { data: existingMovies, error: fetchError } = await supabase
    .from('movie_categories')
    .select('tmdb_id')
    .eq('category_id', categoryId)

  if (fetchError) {
    console.error('Error fetching existing movies:', fetchError)
    throw fetchError
  }

  if (existingMovies.length >= limit) {
    const moviesToDelete = existingMovies
      .slice(0, existingMovies.length - limit + 1)
      .map(movie => movie.tmdb_id)

    const { error: deleteError } = await supabase
      .from('movies')
      .delete()
      .in('tmdb_id', moviesToDelete)

    if (deleteError) {
      console.error('Error deleting movies:', deleteError)
      throw deleteError
    }
  }
}

const insertMoviesIntoDB = async (movies, categoryId) => {
  for (const movie of movies) {
    const { genre_ids, ...movieData } = movie
    const { data: existingMovie, error: fetchError } = await supabase
      .from('movies')
      .select('tmdb_id')
      .eq('tmdb_id', movie.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error checking for existing movie:', fetchError)
      continue
    }

    if (!existingMovie) {
      const { error: insertError } = await supabase.from('movies').insert({
        ...movieData,
        tmdb_id: movie.id,
        category_id: categoryId
      })

      if (insertError) {
        console.error('Error inserting movie:', insertError)
        throw insertError
      }

      const { error: categoryError } = await supabase
        .from('movie_categories')
        .insert({
          tmdb_id: movie.id,
          category_id: categoryId
        })

      if (categoryError) {
        console.error('Error associating movie with category:', categoryError)
        throw categoryError
      }

      if (genre_ids && genre_ids.length > 0) {
        const genreData = genre_ids.map(genre_id => ({
          tmdb_id: movie.id,
          genre_id
        }))

        const { error: genreError } = await supabase
          .from('movie_genres')
          .insert(genreData)

        if (genreError) {
          console.error('Error inserting movie genres:', genreError)
          throw genreError
        }
      }
    }
  }
}

const fetchCategoriesFromDB = async () => {
  const { data, error } = await supabase.from('categories').select('id, name')

  if (error) {
    console.error('Error fetching categories:', error)
    throw error
  }

  return data
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(req, res) {
  try {
    await fetchAndInsertGenres()
    const categories = await fetchCategoriesFromDB()
    const totalRequests = 10
    const movieLimitPerCategory = 10000

    for (const { id, name } of categories) {
      let allMovies = []

      for (let i = 1; i <= totalRequests; i++) {
        const movies = await fetchMoviesFromCategory(name, i)
        allMovies = allMovies.concat(movies)
        await delay(1000)
      }

      await deleteMoviesFromDB(id, movieLimitPerCategory)
      await insertMoviesIntoDB(allMovies, id)
    }

    res
      .status(200)
      .json({ message: 'Movies and genres fetched and inserted successfully!' })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({
      error: 'An error occurred while fetching and inserting movies and genres.'
    })
  }
}
