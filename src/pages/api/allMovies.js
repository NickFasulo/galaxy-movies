export default async function handler(req, res) {
  const { category = 'popular', page = 1, search = '' } = req.query
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const popularCutoffYear = now.getFullYear() - 3
  const popularCutoffDate = `${popularCutoffYear}-01-01`
  const ninetyDaysAgo = new Date(new Date().setDate(now.getDate() - 90)).toISOString().split('T')[0]

  try {
    const pageNum = parseInt(page, 10)
    let endpoint = ''

    if (search.trim().length > 0) {
      endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${popularCutoffDate}`
    } else if (category === 'now_playing') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${ninetyDaysAgo}&primary_release_date.lte=${todayStr}`
    } else if (category === 'upcoming') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${todayStr}`
    } else {
      endpoint = `https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${pageNum}&include_adult=false`
    }

    const response = await fetch(endpoint)
    if (!response.ok) {
      return res.status(response.status).json({ message: 'TMDB API fetch failed' })
    }

    const data = await response.json()
    const rawMovies = data.results || []

    const filteredMovies = rawMovies.filter(movie => {
      if (!movie.poster_path) return false
      
      if (category === 'popular' && movie.release_date) {
        const releaseYear = new Date(movie.release_date).getFullYear()
        if (releaseYear < popularCutoffYear) return false
      }

      if (category === 'upcoming' && movie.release_date) {
        if (movie.release_date < todayStr) return false
      }

      return true
    })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')

    return res.status(200).json({
      ...data,
      results: filteredMovies
    })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Internal Server Error' })
  }
}