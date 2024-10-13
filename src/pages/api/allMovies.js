import supabase from '../../lib/supabaseClient'

// export default async function handler(req, res) {
// 	const { category, page } = req.query

// 	const apiKey = process.env.TMDB_API_KEY

// 	try {
// 		const response = await fetch(
// 			`https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${page}`
// 		)
// 		const data = await response.json()

// 		if (!response.ok) {
// 			throw new Error(data.status_message || 'Failed to fetch data')
// 		}

// 		res.status(200).json(data)
// 	} catch (error) {
// 		res.status(500).json({ message: error.message })
// 	}
// }

export default async function handler(req, res) {
  const { category, page = 1 } = req.query
  const itemsPerPage = 20

  try {
    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', category)
      .single()

    if (categoryError || !categoryData) {
      throw new Error(`Category not found: ${category}`)
    }

    const categoryId = categoryData.id

    const { count: totalResults, error: countError } = await supabase
      .from('movie_categories')
      .select('movie_id', { count: 'exact' })
      .eq('category_id', categoryId)

    if (countError)
      throw new Error('Failed to count movies: ' + countError.message)

    const { data: moviesData, error } = await supabase
      .from('movies')
      .select('tmdb_id, title, poster_path, backdrop_path')
      .in(
        'id',
        supabase
          .from('movie_categories')
          .select('movie_id')
          .eq('category_id', categoryId)
      )
      .range((page - 1) * itemsPerPage, page * itemsPerPage - 1)

    if (error) {
      throw new Error(
        'Failed to fetch movie data from Supabase: ' + error.message
      )
    }

    const totalPages = Math.ceil(totalResults / itemsPerPage)

    const response = {
      page: parseInt(page, 10),
      results: moviesData.map(movie => ({
        id: movie.tmdb_id,
        title: movie.title,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path
      })),
      total_pages: totalPages,
      total_results: totalResults
    }

    res.status(200).json(response)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
