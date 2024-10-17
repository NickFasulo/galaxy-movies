import supabase from '../../lib/supabaseClient'

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
      console.error(`Category not found: ${categoryError?.message}`)
      throw new Error(`Category not found: ${category}`)
    }

    const categoryId = categoryData.id

    const { data: movieIdsData, error: movieIdsError } = await supabase
      .from('movie_categories')
      .select('movie_id')
      .eq('category_id', categoryId)

    if (movieIdsError || !movieIdsData) {
      console.error(`Failed to fetch movie IDs: ${movieIdsError?.message}`)
      throw new Error('Failed to fetch movie IDs: ' + movieIdsError.message)
    }

    const movieIds = movieIdsData.map(entry => entry.movie_id)

    if (movieIds.length === 0) {
      console.warn(`No movies found for the category: ${category}`)
      return res
        .status(404)
        .json({ message: 'No movies found for this category' })
    }

    const { data: moviesData, error: moviesError } = await supabase
      .from('movies')
      .select('tmdb_id, title, poster_path, backdrop_path')
      .in('id', movieIds)
      .range((page - 1) * itemsPerPage, page * itemsPerPage - 1)

    if (moviesError) {
      console.error(`Failed to fetch movie data: ${moviesError?.message}`)
      throw new Error('Failed to fetch movie data: ' + moviesError.message)
    }

    const totalResults = movieIds.length
    const totalPages = Math.ceil(totalResults / itemsPerPage)

    if (page > totalPages) {
      console.warn(
        `Requested page (${page}) exceeds total pages (${totalPages})`
      )
      return res.status(404).json({ message: 'Page not found' })
    }

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
    console.error('API Error:', error.message)
    res.status(500).json({ message: error.message })
  }
}
