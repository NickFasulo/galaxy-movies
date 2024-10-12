import supabase from '../../lib/supabaseClient'
const TMDB_API_KEY = process.env.TMDB_API_KEY

const fetchMoviesFromCategory = async (category, page) => {
  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${category}?api_key=${TMDB_API_KEY}&page=${page}`
  )
  const data = await response.json()
  return data.results.map(movie => ({ tmdb_id: movie.id }))
}

const fetchMovieDetails = async tmdbId => {
  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`
  )
  const data = await response.json()
  return data
}

const handleMovieCollection = async belongs_to_collection => {
  if (!belongs_to_collection) {
    return null
  }

  try {
    const collection = belongs_to_collection

    const { data: existingCollection, error: collectionFetchError } =
      await supabase
        .from('collections')
        .select('id')
        .eq('tmdb_id', collection.id)
        .maybeSingle()

    if (collectionFetchError) {
      console.error('Error fetching collection:', collectionFetchError)
      throw collectionFetchError
    }

    if (existingCollection) {
      return existingCollection.id
    } else {
      const { data: newCollection, error: collectionInsertError } =
        await supabase
          .from('collections')
          .insert({
            tmdb_id: collection.id,
            name: collection.name,
            poster_path: collection.poster_path,
            backdrop_path: collection.backdrop_path
          })
          .select('id')
          .single()

      if (collectionInsertError) {
        console.error('Error inserting collection:', collectionInsertError)
        throw collectionInsertError
      }

      return newCollection.id
    }
  } catch (error) {
    console.error('Error handling movie collection:', error)
    throw error
  }
}

const handleProductionCompanies = async (productionCompanies, movieId) => {
  try {
    for (const company of productionCompanies) {
      const { data: existingCompany, error: companyFetchError } = await supabase
        .from('production_companies')
        .select('id')
        .eq('tmdb_id', company.id)
        .single()

      if (companyFetchError && companyFetchError.code !== 'PGRST116') {
        console.error('Error fetching production company:', companyFetchError)
        throw companyFetchError
      }

      let productionCompanyId
      if (existingCompany) {
        productionCompanyId = existingCompany.id
      } else {
        const { data: newCompany, error: companyInsertError } = await supabase
          .from('production_companies')
          .insert({
            tmdb_id: company.id,
            name: company.name,
            logo_path: company.logo_path,
            origin_country: company.origin_country
          })
          .select('id')
          .single()

        if (companyInsertError) {
          console.error(
            'Error inserting production company:',
            companyInsertError
          )
          throw companyInsertError
        }

        productionCompanyId = newCompany.id
      }

      const { error: movieCompanyInsertError } = await supabase
        .from('movie_production_companies')
        .insert({
          tmdb_id: movieId,
          production_company_id: productionCompanyId
        })

      if (movieCompanyInsertError) {
        console.error(
          'Error inserting movie_production_companies:',
          movieCompanyInsertError
        )
        throw movieCompanyInsertError
      }
    }
  } catch (error) {
    console.error('Error handling production companies:', error)
    throw error
  }
}

const rateLimit = async (requests, limit) => {
  const batches = []

  for (let i = 0; i < requests.length; i += limit) {
    batches.push(requests.slice(i, i + limit))
  }

  for (const batch of batches) {
    await Promise.all(batch.map(request => request()))
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

const insertMoviesIntoDB = async (movies, categoryId) => {
  const fetchMovieDetailTasks = movies.map(movie => async () => {
    try {
      const { data: existingMovie, error: fetchMovieError } = await supabase
        .from('movies')
        .select('id')
        .eq('tmdb_id', movie.tmdb_id)
        .maybeSingle()

      if (fetchMovieError) {
        console.error('Error fetching movie:', fetchMovieError)
        throw fetchMovieError
      }

      let movieId
      let movieDetails = existingMovie
        ? null
        : await fetchMovieDetails(movie.tmdb_id)

      if (existingMovie) {
        movieId = existingMovie.id
        console.log(`Movie with tmdb_id ${movie.tmdb_id} already exists.`)
      } else {
        const collectionId = await handleMovieCollection(
          movieDetails.belongs_to_collection
        )

        const { data: insertedMovie, error: insertError } = await supabase
          .from('movies')
          .insert({
            tmdb_id: movieDetails.id,
            title: movieDetails.title,
            adult: movieDetails.adult,
            overview: movieDetails.overview,
            release_date: movieDetails.release_date,
            runtime: movieDetails.runtime,
            budget: movieDetails.budget,
            revenue: movieDetails.revenue,
            vote_average: movieDetails.vote_average,
            vote_count: movieDetails.vote_count,
            poster_path: movieDetails.poster_path,
            backdrop_path: movieDetails.backdrop_path,
            homepage: movieDetails.homepage,
            status: movieDetails.status,
            tagline: movieDetails.tagline,
            popularity: movieDetails.popularity,
            imdb_id: movieDetails.imdb_id,
            category_id: categoryId,
            video: movieDetails.video,
            production_countries: movieDetails.production_countries,
            spoken_languages: movieDetails.spoken_languages
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('Error inserting movie:', insertError)
          throw insertError
        }

        movieId = insertedMovie.id

        const { error: insertCategoryError } = await supabase
          .from('movie_categories')
          .insert({
            movie_id: movieId,
            category_id: categoryId
          })

        if (insertCategoryError) {
          console.error(
            'Error inserting movie_categories:',
            insertCategoryError
          )
          throw insertCategoryError
        }

        if (collectionId && movieId) {
          const { error: insertCollectionError } = await supabase
            .from('movie_collections')
            .insert({
              movie_id: movieId,
              collection_id: collectionId
            })

          if (insertCollectionError) {
            console.error(
              'Error inserting movie_collection:',
              insertCollectionError
            )
            throw insertCollectionError
          }
        }
      }

      if (!movieDetails && movieId) {
        movieDetails = await fetchMovieDetails(movie.tmdb_id)
      }

      if (movieId) {
        await handleProductionCompanies(
          movieDetails.production_companies,
          movieId
        )
      }
    } catch (error) {
      console.error('Error fetching movie details or inserting movie:', error)
    }
  })

  await rateLimit(fetchMovieDetailTasks, 40)
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
    const categories = await fetchCategoriesFromDB()
    const totalRequests = 20
    const movieLimitPerCategory = 10000

    for (const { id, name } of categories) {
      let allMovies = []

      for (let i = 1; i <= totalRequests; i++) {
        const movies = await fetchMoviesFromCategory(name, i)
        allMovies = allMovies.concat(movies)
        await delay(1500)
      }

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
