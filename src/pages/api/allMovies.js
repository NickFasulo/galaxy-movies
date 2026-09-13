export default async function handler(req, res) {
  const { category = 'popular', page = 1, search = '' } = req.query
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const strictKeywords = [
    'togefilm', 'toge', 'hotshots', 'ullu', 'altbalaji', 'kooku', 
    'primeplay', 'fliz', 'cineprime', 'porn', 'pornography', 
    'softcore', 'hentai', 'sexploitation'
  ]

  const strictRegex = new RegExp(`\\b(${strictKeywords.join('|')})\\b`, 'i')

  try {
    const pageNum = parseInt(page, 10)
    let endpoint = ''

    if (search.trim().length > 0) {
      endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
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
      if (movie.adult || !movie.poster_path) return false
      const title = movie.title || ''
      const overview = movie.overview || ''
      return !strictRegex.test(`${title} ${overview}`)
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