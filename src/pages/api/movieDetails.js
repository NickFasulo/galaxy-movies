import supabase from '../../lib/supabaseClient'

// export default async function handler(req, res) {
//   const { movieId } = req.query

//   try {
//     const response = await fetch(
//       `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`
//     )
//     if (!response.ok) {
//       return res
//         .status(response.status)
//         .json({ message: 'Error fetching movie' })
//     }
//     const movieData = await response.json()
//     res.status(200).json(movieData)
//   } catch (error) {
//     res.status(500).json({ message: 'Internal Server Error' })
//   }
// }

export default async function handler(req, res) {
  const { movieId } = req.query

  try {
    const { data: movieData, error: movieError } = await supabase
      .from('movies')
      .select('*')
      .eq('tmdb_id', movieId)
      .single()

    if (movieError || !movieData) {
      return res.status(404).json({ message: 'Movie not found' })
    }

    const { data: genresData, error: genresError } = await supabase
      .from('movie_genres')
      .select('genre_id, genres(id, name)')
      .eq('movie_id', movieData.id)

    if (genresError) {
      return res.status(500).json({ message: 'Error fetching genres' })
    }

    const { data: productionCompaniesData, error: productionCompaniesError } =
      await supabase
        .from('movie_production_companies')
        .select('production_company_id')
        .eq('tmdb_id', movieId)

    if (productionCompaniesError) {
      return res
        .status(500)
        .json({ message: 'Error fetching production companies' })
    }

    let production_companies = []

    if (productionCompaniesData && productionCompaniesData.length > 0) {
      const companyIds = productionCompaniesData.map(
        p => p.production_company_id
      )

      const { data: companies, error: companiesError } = await supabase
        .from('production_companies')
        .select('id, name, logo_path, origin_country')
        .in('id', companyIds)

      if (companiesError) {
        return res
          .status(500)
          .json({ message: 'Error fetching production company details' })
      }

      production_companies = companies.map(company => ({
        id: company.id,
        name: company.name,
        logo_path: company.logo_path,
        origin_country: company.origin_country
      }))
    }

    // const { data: collectionLinkData, error: collectionLinkError } =
    //   await supabase
    //     .from('movie_collections')
    //     .select('collection_id')
    //     .eq('movie_id', movieData.id)
    //     .single()

    // let belongs_to_collection = null

    // if (collectionLinkData) {
    //   const { data: collectionData, error: collectionError } = await supabase
    //     .from('collections')
    //     .select('id, name, poster_path, backdrop_path, tmdb_id')
    //     .eq('id', collectionLinkData.collection_id)
    //     .single()

    //   if (collectionData) {
    //     belongs_to_collection = {
    //       id: collectionData.tmdb_id,
    //       name: collectionData.name,
    //       poster_path: collectionData.poster_path,
    //       backdrop_path: collectionData.backdrop_path
    //     }
    //   }
    // }

    // if (collectionLinkError || !collectionLinkData) {
    //   belongs_to_collection = null
    // }

    const genres = genresData.map(g => ({
      id: g.genres.id,
      name: g.genres.name
    }))

    // const production_companies = productionCompaniesData.map(p => ({
    //   id: p.production_companies.id,
    //   logo_path: p.production_companies.logo_path,
    //   name: p.production_companies.name,
    //   origin_country: p.production_companies.origin_country
    // }))

    // const production_countries = movieData.production_countries || []
    // const spoken_languages = movieData.spoken_languages || []

    const response = {
      adult: movieData.adult,
      backdrop_path: movieData.backdrop_path,
      // belongs_to_collection: belongs_to_collection,
      budget: movieData.budget,
      genres,
      homepage: movieData.homepage,
      id: movieData.tmdb_id,
      imdb_id: movieData.imdb_id,
      // origin_country: production_countries.map(c => c.iso_3166_1),
      original_language: movieData.original_language,
      overview: movieData.overview,
      popularity: movieData.popularity,
      poster_path: movieData.poster_path,
      production_companies,
      // production_countries,
      release_date: movieData.release_date,
      revenue: movieData.revenue,
      runtime: movieData.runtime,
      // spoken_languages,
      status: movieData.status,
      tagline: movieData.tagline,
      title: movieData.title,
      video: movieData.video,
      vote_average: movieData.vote_average,
      vote_count: movieData.vote_count
    }

    res.status(200).json({ movie: response })
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' })
  }
}
